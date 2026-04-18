/**
 * Widget loader bridge: ogni funzione restituisce una Promise per il dynamic import del relativo
 * editor component lazy. Le promise sono cachate a livello modulo: alla prima chiamata viene avviato
 * `import(...)`, alle chiamate successive viene restituita la stessa promise gia risolta. Senza questa
 * cache, un dialog "Modifica" con N campi dello stesso tipo genera N microtask di import separate,
 * che frammentano la change detection di Angular e amplificano i long task post-render
 * (vedi misurazione LoAF su /cities/list "Modifica" pre/post fix-2).
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
