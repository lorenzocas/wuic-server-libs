/**
 * Widget loader bridge: ogni funzione restituisce una Promise per il dynamic import del relativo
 * editor component lazy. Le promise sono cachate a livello modulo: alla prima chiamata viene avviato
 * `import(...)`, alle chiamate successive viene restituita la stessa promise gia risolta. Senza questa
 * cache, un dialog "Modifica" con N campi dello stesso tipo genera N microtask di import separate,
 * che frammentano la change detection di Angular e amplificano i long task post-render
 * (vedi misurazione LoAF su /cities/list "Modifica" pre/post fix nella libreria framework).
 */

let textEditorPromise: Promise<any> | null = null;
export function loadTextEditorComponent() {
  return textEditorPromise ??= import('wuic-framework-lib-src/component/field/text-editor/text-editor.component').then((m) => m.TextEditorComponent);
}

let textAreaEditorPromise: Promise<any> | null = null;
export function loadTextAreaEditorComponent() {
  return textAreaEditorPromise ??= import('wuic-framework-lib-src/component/field/text-area-editor/text-area-editor.component').then((m) => m.TextAreaEditorComponent);
}

let numberEditorPromise: Promise<any> | null = null;
export function loadNumberEditorComponent() {
  return numberEditorPromise ??= import('wuic-framework-lib-src/component/field/number-editor/number-editor.component').then((m) => m.NumberEditorComponent);
}

let booleanEditorPromise: Promise<any> | null = null;
export function loadBooleanEditorComponent() {
  return booleanEditorPromise ??= import('wuic-framework-lib-src/component/field/boolean-editor/boolean-editor.component').then((m) => m.BooleanEditorComponent);
}

let lookupEditorPromise: Promise<any> | null = null;
export function loadLookupEditorComponent() {
  return lookupEditorPromise ??= import('wuic-framework-lib-src/component/field/lookup-editor/lookup-editor.component').then((m) => m.LookupEditorComponent);
}

let buttonEditorPromise: Promise<any> | null = null;
export function loadButtonEditorComponent() {
  return buttonEditorPromise ??= import('wuic-framework-lib-src/component/field/button-editor/button-editor.component').then((m) => m.ButtonEditorComponent);
}

let dateEditorPromise: Promise<any> | null = null;
export function loadDateEditorComponent() {
  return dateEditorPromise ??= import('wuic-framework-lib-src/component/field/date-editor/date-editor.component').then((m) => m.DateEditorComponent);
}

let dictionaryEditorPromise: Promise<any> | null = null;
export function loadDictionaryEditorComponent() {
  return dictionaryEditorPromise ??= import('wuic-framework-lib-src/component/field/dictionary-editor/dictionary-editor.component').then((m) => m.DictionaryEditorComponent);
}

let htmlEditorPromise: Promise<any> | null = null;
export function loadHtmlEditorComponent() {
  return htmlEditorPromise ??= import('wuic-framework-lib-src/component/field/html-editor/html-editor.component').then((m) => m.HtmlEditorComponent);
}

let uploadEditorPromise: Promise<any> | null = null;
export function loadUploadEditorComponent() {
  return uploadEditorPromise ??= import('wuic-framework-lib-src/component/field/upload-editor/upload-editor.component').then((m) => m.UploadEditorComponent);
}

let codeAreaEditorPromise: Promise<any> | null = null;
export function loadCodeAreaEditorComponent() {
  return codeAreaEditorPromise ??= import('wuic-framework-lib-src/component/field/code-area-editor/code-area-editor.component').then((m) => m.CodeAreaEditorComponent);
}

let colorEditorPromise: Promise<any> | null = null;
export function loadColorEditorComponent() {
  return colorEditorPromise ??= import('wuic-framework-lib-src/component/field/color-editor/color-editor.component').then((m) => m.ColorEditorComponent);
}

let treeViewSelectorPromise: Promise<any> | null = null;
export function loadTreeViewSelectorComponent() {
  return treeViewSelectorPromise ??= import('wuic-framework-lib-src/component/field/tree-view-selector/tree-view-selector.component').then((m) => m.TreeViewSelectorComponent);
}

let propertyArrayEditorPromise: Promise<any> | null = null;
export function loadPropertyArrayEditorComponent() {
  return propertyArrayEditorPromise ??= import('wuic-framework-lib-src/component/field/property-array-editor/property-array-editor.component').then((m) => m.PropertyArrayEditorComponent);
}

let propertyObjectEditorPromise: Promise<any> | null = null;
export function loadPropertyObjectEditorComponent() {
  return propertyObjectEditorPromise ??= import('wuic-framework-lib-src/component/field/property-object-editor/property-object-editor.component').then((m) => m.PropertyObjectEditorComponent);
}
