export function loadTextEditorComponent() {
  return import('wuic-framework-lib-src/component/field/text-editor/text-editor.component').then((m) => m.TextEditorComponent);
}

export function loadTextAreaEditorComponent() {
  return import('wuic-framework-lib-src/component/field/text-area-editor/text-area-editor.component').then((m) => m.TextAreaEditorComponent);
}

export function loadNumberEditorComponent() {
  return import('wuic-framework-lib-src/component/field/number-editor/number-editor.component').then((m) => m.NumberEditorComponent);
}

export function loadBooleanEditorComponent() {
  return import('wuic-framework-lib-src/component/field/boolean-editor/boolean-editor.component').then((m) => m.BooleanEditorComponent);
}

export function loadLookupEditorComponent() {
  return import('wuic-framework-lib-src/component/field/lookup-editor/lookup-editor.component').then((m) => m.LookupEditorComponent);
}

export function loadButtonEditorComponent() {
  return import('wuic-framework-lib-src/component/field/button-editor/button-editor.component').then((m) => m.ButtonEditorComponent);
}

export function loadDateEditorComponent() {
  return import('wuic-framework-lib-src/component/field/date-editor/date-editor.component').then((m) => m.DateEditorComponent);
}

export function loadDictionaryEditorComponent() {
  return import('wuic-framework-lib-src/component/field/dictionary-editor/dictionary-editor.component').then((m) => m.DictionaryEditorComponent);
}

export function loadHtmlEditorComponent() {
  return import('wuic-framework-lib-src/component/field/html-editor/html-editor.component').then((m) => m.HtmlEditorComponent);
}

export function loadUploadEditorComponent() {
  return import('wuic-framework-lib-src/component/field/upload-editor/upload-editor.component').then((m) => m.UploadEditorComponent);
}

export function loadCodeAreaEditorComponent() {
  return import('wuic-framework-lib-src/component/field/code-area-editor/code-area-editor.component').then((m) => m.CodeAreaEditorComponent);
}

export function loadColorEditorComponent() {
  return import('wuic-framework-lib-src/component/field/color-editor/color-editor.component').then((m) => m.ColorEditorComponent);
}

export function loadTreeViewSelectorComponent() {
  return import('wuic-framework-lib-src/component/field/tree-view-selector/tree-view-selector.component').then((m) => m.TreeViewSelectorComponent);
}

export function loadPropertyArrayEditorComponent() {
  return import('wuic-framework-lib-src/component/field/property-array-editor/property-array-editor.component').then((m) => m.PropertyArrayEditorComponent);
}

export function loadPropertyObjectEditorComponent() {
  return import('wuic-framework-lib-src/component/field/property-object-editor/property-object-editor.component').then((m) => m.PropertyObjectEditorComponent);
}
