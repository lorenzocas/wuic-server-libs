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
