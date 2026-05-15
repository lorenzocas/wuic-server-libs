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
