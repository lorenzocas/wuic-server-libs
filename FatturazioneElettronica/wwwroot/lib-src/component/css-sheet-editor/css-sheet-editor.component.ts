import { AfterViewInit, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ColorPickerModule } from 'primeng/colorpicker';
import { NgStyle } from '@angular/common';

type CssStyleRow = { Key: string; Value: string; };
type CssClassRow = { SelectorString: string; ClassNames: string[]; Styles: CssStyleRow[]; Media?: string; };
type CssSheetRow = { SheetPath: string; classes: CssClassRow[]; };
type StyleProp = { key: string; type: string; values?: string[]; };

@Component({
  selector: 'wuic-css-sheet-editor',
  imports: [FormsModule, DialogModule, ButtonModule, SelectModule, ColorPickerModule, NgStyle],
  templateUrl: './css-sheet-editor.component.html',
  styleUrl: './css-sheet-editor.component.css'
})
export class CssSheetEditorComponent implements OnChanges, AfterViewInit {
  /**
   * Input dal componente padre per visible; usata nella configurazione e nel rendering del componente.
   */
  @Input() visible = false;
  /**
   * Evento emesso verso il componente padre per notificare cambi di stato relativi a visible change.
   */
  @Output() visibleChange = new EventEmitter<boolean>();

  /**
   * Input dal componente padre per sheets; usata nella configurazione e nel rendering del componente.
   */
  @Input() sheets: CssSheetRow[] = [];
  /**
   * Input dal componente padre per selected sheet path; usata nella configurazione e nel rendering del componente.
   */
  @Input() selectedSheetPath = '';
  /**
   * Input dal componente padre per style props; usata nella configurazione e nel rendering del componente.
   */
  @Input() styleProps: StyleProp[] = [];
  /**
   * Input dal componente padre per assets folder; usata nella configurazione e nel rendering del componente.
   */
  @Input() assetsFolder = '';

  /**
   * Evento emesso verso il componente padre per notificare cambi di stato relativi a apply editor.
   */
  @Output() applyEditor = new EventEmitter<{ sheets: CssSheetRow[]; selectedSheetPath: string; }>();

  /**
   * Collezione dati per draft sheets, consumata dal rendering e dalle operazioni del componente.
   */
  draftSheets: CssSheetRow[] = [];
  /**
   * Valore corrente selezionato per selected sheet path draft, usato dai flussi interattivi del componente.
   */
  selectedSheetPathDraft = '';
  /**
   * Valore corrente selezionato per selected class selector, usato dai flussi interattivi del componente.
   */
  selectedClassSelector = '';
  /**
   * Identificativo tecnico per pending style key, usato in matching, lookup o routing interno.
   */
  pendingStyleKey = '';
  /**
   * Configurazione di presentazione per pending style value, usata nel rendering del componente.
   */
  pendingStyleValue = '';

  /**
   * Proprieta di stato del componente per new sheet name, usata dalla logica interna e dal template.
   */
  newSheetName = '';
  /**
   * Proprieta di stato del componente per new class name, usata dalla logica interna e dal template.
   */
  newClassName = '';

  alphaValue = 1;

  valore: any;
  pickerValue: any;

  ngAfterViewInit() {
    this.valore = this.pendingStyleValue;
    if (!this.valore) {
      this.valore = '#FFFFFF';
    }

    this.pickerValue = this.toHsbaModel(this.valore);
    this.alphaValue = this.clampAlpha(this.pickerValue?.a);

  }

  /**
* Gestisce i cambiamenti degli input aggiornando lo stato derivato e le dipendenze del componente.
* @param changes Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
*/
  ngOnChanges(changes: SimpleChanges): void {
    const visibleChange = changes['visible'];
    const becameVisible = !!visibleChange && visibleChange.currentValue === true && visibleChange.previousValue !== true;
    if (becameVisible || changes['sheets'] || changes['selectedSheetPath']) {
      this.syncDraft();
    }
  }

  /**
* Gestisce la logica operativa di `close` orchestrando le chiamate `emit`.
*/
  close(): void {
    this.selectedSheetPathDraft = '';
    this.selectedClassSelector = '';
    this.newSheetName = '';
    this.newClassName = '';
    this.pendingStyleKey = '';
    this.pendingStyleValue = '';
    this.visible = false;
    this.visibleChange.emit(false);
  }

  /**
* Gestisce la logica operativa di `addSheet` orchestrando le chiamate `buildAssetSheetPath` e `some`.
*/
  addSheet(): void {
    const path = this.buildAssetSheetPath(this.newSheetName);
    if (!path) {
      return;
    }

    if (this.draftSheets.some((s) => this.normalizePath(s.SheetPath) === path)) {
      this.selectedSheetPathDraft = path;
      this.newSheetName = '';
      return;
    }

    this.draftSheets.push({ SheetPath: path, classes: [] });
    this.selectedSheetPathDraft = path;
    this.selectedClassSelector = '';
    this.newSheetName = '';
    this.emitChanges();
  }

  /**
* Esegue operazioni di persistenza/sincronizzazione in `removeSelectedSheet` trasformando e filtrando collezioni dati.
*/
  removeSelectedSheet(): void {
    const sheet = this.currentSheet;
    if (!sheet) {
      return;
    }

    this.draftSheets = this.draftSheets.filter((s) => this.normalizePath(s.SheetPath) !== this.normalizePath(sheet.SheetPath));
    this.selectedSheetPathDraft = this.draftSheets[0]?.SheetPath || '';
    this.selectedClassSelector = '';
    this.emitChanges();
  }

  /**
* Gestisce la logica operativa di `addClassToSelectedSheet` orchestrando le chiamate `replace` e `String`.
*/
  addClassToSelectedSheet(): void {
    const sheet = this.currentSheet;
    if (!sheet) {
      return;
    }

    const className = String(this.newClassName || '').trim().replace(/^\./, '');
    if (!className) {
      return;
    }

    const selector = `.${className}`;
    if (sheet.classes.some((c) => String(c.SelectorString || '').trim() === selector)) {
      this.selectedClassSelector = selector;
      this.newClassName = '';
      return;
    }

    sheet.classes.push({
      SelectorString: selector,
      ClassNames: [className],
      Styles: []
    });
    this.selectedClassSelector = selector;
    this.newClassName = '';
    this.emitChanges();
  }

  /**
* Esegue operazioni di persistenza/sincronizzazione in `removeSelectedClass` trasformando e filtrando collezioni dati.
*/
  removeSelectedClass(): void {
    const sheet = this.currentSheet;
    const cssClass = this.currentClass;
    if (!sheet || !cssClass) {
      return;
    }

    sheet.classes = sheet.classes.filter((c) => c.SelectorString !== cssClass.SelectorString);
    this.selectedClassSelector = sheet.classes[0]?.SelectorString || '';
    this.emitChanges();
  }

  /**
* Gestisce la logica operativa di `addStyleToSelectedClass` orchestrando le chiamate `String` e `defaultValueForProperty`.
*/
  addStyleToSelectedClass(): void {
    const cssClass = this.currentClass;
    if (!cssClass || !this.styleProps?.length) {
      return;
    }

    const key = String(this.pendingStyleKey || '').trim();
    if (!key) {
      return;
    }

    const value = this.defaultValueForProperty(key, this.pendingStyleValue);
    const existing = cssClass.Styles.find((s) => String(s?.Key || '').trim() === key);
    if (existing) {
      // Existing styles are immutable in the editor: they can only be removed.
      return;
    }

    cssClass.Styles.push({ Key: key, Value: value });

    this.pendingStyleValue = this.defaultValueForProperty(key);
    this.emitChanges();
  }

  /**
* Esegue l'operazione di persistenza/sincronizzazione in `removeStyle` aggiornando lo stato locale quando necessario.
* @param index Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  removeStyle(index: number): void {
    const cssClass = this.currentClass;
    if (!cssClass) {
      return;
    }

    cssClass.Styles.splice(index, 1);
    this.emitChanges();
  }

  /**
* Gestisce la logica operativa di `onStyleKeyChanged` in modo coerente con l'implementazione corrente.
* @param style Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  onStyleKeyChanged(style: CssStyleRow): void {
    if (!style) {
      return;
    }

    style.Value = this.defaultValueForProperty(style.Key, style.Value);
    this.emitChanges();
  }

  /**
* Gestisce la logica operativa di `onStyleValueChanged` orchestrando le chiamate `emitChanges`.
*/
  onStyleValueChanged(): void {
    this.emitChanges();
  }

  /**
* Gestisce la logica operativa di `onPendingStyleKeyChanged` orchestrando le chiamate `defaultValueForProperty`.
*/
  onPendingStyleKeyChanged(): void {
    this.pendingStyleValue = this.defaultValueForProperty(this.pendingStyleKey, this.pendingStyleValue);
  }

  /**
* Recupera e prepara i dati richiesti dal chiamante normalizzando e trasformando collezioni di record.
* @param propKey Identificativo tecnico usato per lookup, confronto o aggiornamento mirato.
* @returns Collezione di tipo `string[]` derivata dalle trasformazioni applicate nel metodo.
*/
  getPropertyValues(propKey: string): string[] {
    const prop = this.styleProps.find((p) => p.key === propKey);
    if (!prop || prop.type !== 'dictionary') {
      return [];
    }

    return (prop.values || []).filter((v) => String(v || '').trim().length > 0);
  }

  /**
 * Verifica una condizione di stato o di validita orchestrando le chiamate `find`.
 * @param propKey Identificativo tecnico usato per lookup, confronto o aggiornamento mirato.
 * @returns Esito booleano del controllo effettuato dal metodo (true quando la condizione verificata risulta soddisfatta).
 */
  isPropertyDictionary(propKey: string): boolean {
    const prop = this.styleProps.find((p) => p.key === propKey);
    return !!prop && prop.type === 'dictionary';
  }

  /**
 * Verifica una condizione di stato o di validita orchestrando le chiamate `find` e `toLowerCase`.
 * @param propKey Identificativo tecnico usato per lookup, confronto o aggiornamento mirato.
 * @returns Esito booleano dell'elaborazione svolta dal metodo.
 */
  isPropertyColor(propKey: string): boolean {
    const prop = this.styleProps.find((p) => p.key === propKey);
    if (prop?.type === 'color') {
      return true;
    }

    const normalized = String(propKey || '').toLowerCase();
    return normalized.includes('color');
  }

  /**
* Gestisce la logica di `colorPickerValue` orchestrando le chiamate `String` e `test`.
* @param value Valore in ingresso elaborato o normalizzato dal metodo.
* @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale).
*/
  colorPickerValue(value: string): string {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(raw) || /^#[0-9a-f]{6}$/i.test(raw) || /^#[0-9a-f]{8}$/i.test(raw)) {
      return raw;
    }

    return '#000000';
  }

  /**
* Gestisce la logica di `onPendingColorChanged` orchestrando le chiamate `String`.
* @param value Valore in ingresso elaborato o normalizzato dal metodo.
*/
  onPendingColorChanged(value: any): void {
    const raw = value;
    const hsba = {
      ...(raw || {}),
      a: this.clampAlpha(raw?.a ?? this.alphaValue)
    };
    this.alphaValue = this.clampAlpha(hsba?.a);
    const newValue = this.toPersistedColor(raw);

    this.pickerValue = raw;
    this.pendingStyleValue = this.valore = newValue;
  }

  /**
* Gestisce la logica operativa di `onStyleColorChanged` in modo coerente con l'implementazione corrente.
* @param style Parametro utilizzato dal metodo nel flusso elaborativo.
* @param value Valore in ingresso elaborato o normalizzato dal metodo.
*/
  onStyleColorChanged(style: CssStyleRow, value: string): void {
    if (!style) {
      return;
    }

    style.Value = String(value || '').trim();
    this.onStyleValueChanged();
  }

  /**
* Gestisce la logica operativa di `onSelectedSheetChanged` orchestrando le chiamate `resetPendingStyle` e `emitChanges`.
*/
  onSelectedSheetChanged(): void {
    const firstClass = this.currentSheet?.classes?.[0];
    this.selectedClassSelector = firstClass?.SelectorString || '';
    this.resetPendingStyle();
    this.emitChanges();
  }

  /**
* Gestisce la logica operativa di `onSelectedClassChanged` orchestrando le chiamate `resetPendingStyle` e `emitChanges`.
*/
  onSelectedClassChanged(): void {
    this.resetPendingStyle();
    this.emitChanges();
  }

  /**
 * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale orchestrando le chiamate `normalizePath` e `trim`.
 */
  private syncDraft(): void {
    const previousSelectedSheetPath = this.normalizePath(this.selectedSheetPathDraft);
    const previousSelectedClass = String(this.selectedClassSelector || '').trim();

    this.draftSheets = this.cloneSheets(this.sheets || []);
    this.selectedSheetPathDraft =
      this.normalizePath(this.selectedSheetPath) ||
      previousSelectedSheetPath ||
      '';

    const currentClasses = this.currentSheet?.classes || [];
    const matchedClass = currentClasses.find((c) => String(c?.SelectorString || '').trim() === previousSelectedClass);
    this.selectedClassSelector = matchedClass?.SelectorString || currentClasses[0]?.SelectorString || '';

    this.newSheetName = '';
    this.newClassName = '';
    this.resetPendingStyle();
  }

  /**
* Gestisce la logica operativa di `cloneSheets` trasformando e filtrando collezioni dati.
* @param sheets Collezione di input processata dal metodo.
* @returns Collezione di tipo `CssSheetRow[]` risultante dalle trasformazioni applicate dal metodo.
*/
  private cloneSheets(sheets: CssSheetRow[]): CssSheetRow[] {
    return (sheets || []).map((sheet) => ({
      SheetPath: this.normalizePath(sheet?.SheetPath),
      classes: (sheet?.classes || []).map((cssClass) => ({
        SelectorString: String(cssClass?.SelectorString || '').trim(),
        ClassNames: Array.isArray(cssClass?.ClassNames) ? cssClass.ClassNames.map((c) => String(c || '').trim()).filter((c) => !!c) : [],
        Media: String(cssClass?.Media || '').trim(),
        Styles: (cssClass?.Styles || []).map((style) => ({
          Key: String(style?.Key || '').trim(),
          Value: String(style?.Value || '').trim()
        })).filter((style) => !!style.Key)
      }))
    })).filter((sheet) => !!sheet.SheetPath);
  }

  /**
* Gestisce la logica di `defaultValueForProperty` trasformando e filtrando collezioni dati.
* @param propKey Identificativo tecnico usato per lookup, match o aggiornamento mirato.
* @param currentValue Valore in ingresso elaborato o normalizzato dal metodo.
* @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale).
*/
  private defaultValueForProperty(propKey: string, currentValue?: string): string {
    const prop = this.styleProps.find((p) => p.key === propKey);
    if (!prop) {
      return String(currentValue || '').trim();
    }

    if (prop.type === 'dictionary') {
      const values = (prop.values || []).filter((v) => String(v || '').trim().length > 0);
      if (currentValue && values.includes(currentValue)) {
        return currentValue;
      }
      return values[0] || '';
    }

    if (this.isPropertyColor(propKey)) {
      const value = String(currentValue || '').trim();
      if (value) {
        return value;
      }
      return '#000000';
    }

    return String(currentValue || '').trim();
  }

  /**
* Gestisce la logica operativa di `normalizePath` in modo coerente con l'implementazione corrente.
* @param path Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Stringa risultante calcolata da `normalizePath` per chiavi/label o valori testuali.
*/
  private normalizePath(path: any): string {
    return String(path || '').trim().replace(/\\/g, '/');
  }

  /**
* Costruisce il payload/struttura risultante in `buildAssetSheetPath` partendo dai dati correnti.
* @param fileName Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Stringa risultante calcolata da `buildAssetSheetPath` per chiavi/label o valori testuali.
*/
  private buildAssetSheetPath(fileName: any): string {
    let normalizedName = String(fileName || '').trim();
    if (!normalizedName) {
      return '';
    }

    // Accept file name only, never a folder path.
    if (normalizedName.includes('/') || normalizedName.includes('\\')) {
      return '';
    }

    normalizedName = normalizedName.replace(/\s+/g, '-');
    if (!normalizedName.toLowerCase().endsWith('.css')) {
      normalizedName += '.css';
    }

    const folder = String(this.assetsFolder || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!folder) {
      return '';
    }

    return `assets/${folder}/${normalizedName}`;
  }

  /**
* Gestisce la logica operativa di `emitChanges` orchestrando le chiamate `emit` e `cloneSheets`.
*/
  private emitChanges(): void {
    this.applyEditor.emit({
      sheets: this.cloneSheets(this.draftSheets),
      selectedSheetPath: this.selectedSheetPathDraft
    });
  }

  /**
 * Ripristina lo stato e pulisce risorse temporanee legate al flusso del componente orchestrando le chiamate `defaultValueForProperty`.
 */
  private resetPendingStyle(): void {
    const firstProp = this.styleProps?.[0];
    this.pendingStyleKey = firstProp?.key || '';
    this.pendingStyleValue = this.defaultValueForProperty(this.pendingStyleKey);
  }

  /**
* Gestisce la logica operativa di `currentSheet` orchestrando le chiamate `find` e `normalizePath`.
* @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
*/


  get currentSheet(): CssSheetRow | null {
    const match = this.draftSheets.find((s) => this.normalizePath(s.SheetPath) === this.normalizePath(this.selectedSheetPathDraft));
    return match || null;
  }

  /**
* Gestisce la logica operativa di `currentClass` orchestrando le chiamate `find` e `String`.
* @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
*/


  get currentClass(): CssClassRow | null {
    const sheet = this.currentSheet;
    if (!sheet) {
      return null;
    }

    const found = sheet.classes.find((c) => String(c.SelectorString || '').trim() === String(this.selectedClassSelector || '').trim());
    return found || null;
  }
  async onAlphaChange(rawAlpha: any) {
    this.alphaValue = this.clampAlpha(rawAlpha);
    this.pickerValue = {
      ...(this.pickerValue || {}),
      a: this.alphaValue
    };

    const newValue = this.toPersistedColor(this.pickerValue);

    this.pendingStyleValue = this.valore = newValue;
  }

  private toPersistedColor(raw: any): string {
    if (raw === undefined || raw === null) {
      return '';
    }

    if (typeof raw === 'string') {
      return raw.trim();
    }

    const h = Number(raw?.h);
    const s = Number(raw?.s);
    const b = Number(raw?.b);
    let a = Number(raw?.a);
    if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(b)) {
      return String(raw);
    }
    if (!Number.isFinite(a)) {
      a = this.alphaValue;
    }
    a = this.clampAlpha(a);

    return this.hsbaToRgbaString(h, s, b, a);
  }

  private toHsbaModel(value: any): any {
    const fallback = { h: 0, s: 0, b: 100, a: 1 };
    if (value === undefined || value === null) {
      return fallback;
    }

    if (typeof value === 'object' && value?.h !== undefined && value?.s !== undefined && value?.b !== undefined) {
      return {
        h: Number(value.h) || 0,
        s: Number(value.s) || 0,
        b: Number(value.b) || 0,
        a: Number.isFinite(Number(value.a)) ? Number(value.a) : 1
      };
    }

    const str = String(value).trim();
    if (!str) {
      return fallback;
    }

    const rgbMatch = str.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
      const parts = rgbMatch[1].split(',').map((x) => x.trim());
      const r = Number(parts[0]);
      const g = Number(parts[1]);
      const b = Number(parts[2]);
      const a = parts.length > 3 ? Number(parts[3]) : 1;
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return this.rgbaToHsbaModel(r, g, b, Number.isFinite(a) ? a : 1);
      }
      return fallback;
    }

    const hex = str.replace('#', '');
    if (/^[0-9a-f]{3,8}$/i.test(hex)) {
      const normalized = hex.length === 3
        ? hex.split('').map((x) => `${x}${x}`).join('') + 'ff'
        : hex.length === 4
          ? hex.split('').map((x) => `${x}${x}`).join('')
          : hex.length === 6
            ? `${hex}ff`
            : hex;

      const r = parseInt(normalized.slice(0, 2), 16);
      const g = parseInt(normalized.slice(2, 4), 16);
      const b = parseInt(normalized.slice(4, 6), 16);
      const a = parseInt(normalized.slice(6, 8), 16) / 255;
      return this.rgbaToHsbaModel(r, g, b, a);
    }

    return fallback;
  }

  private rgbaToHsbaModel(rRaw: number, gRaw: number, bRaw: number, aRaw: number): any {
    const r = Math.max(0, Math.min(255, rRaw)) / 255;
    const g = Math.max(0, Math.min(255, gRaw)) / 255;
    const b = Math.max(0, Math.min(255, bRaw)) / 255;
    const a = Math.max(0, Math.min(1, aRaw));

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
      if (max === r) {
        h = 60 * (((g - b) / delta) % 6);
      } else if (max === g) {
        h = 60 * (((b - r) / delta) + 2);
      } else {
        h = 60 * (((r - g) / delta) + 4);
      }
    }
    if (h < 0) {
      h += 360;
    }

    const s = max === 0 ? 0 : (delta / max) * 100;
    const v = max * 100;

    return {
      h: Math.round(h),
      s: Math.round(s),
      b: Math.round(v),
      a: Number(a.toFixed(3))
    };
  }

  private hsbaToRgbaString(hRaw: number, sRaw: number, bRaw: number, aRaw: number): string {
    const h = ((hRaw % 360) + 360) % 360;
    const s = Math.max(0, Math.min(100, sRaw)) / 100;
    const v = Math.max(0, Math.min(100, bRaw)) / 100;
    const a = Math.max(0, Math.min(1, aRaw));

    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r1 = 0;
    let g1 = 0;
    let b1 = 0;

    if (h < 60) {
      r1 = c; g1 = x; b1 = 0;
    } else if (h < 120) {
      r1 = x; g1 = c; b1 = 0;
    } else if (h < 180) {
      r1 = 0; g1 = c; b1 = x;
    } else if (h < 240) {
      r1 = 0; g1 = x; b1 = c;
    } else if (h < 300) {
      r1 = x; g1 = 0; b1 = c;
    } else {
      r1 = c; g1 = 0; b1 = x;
    }

    const r = Math.round((r1 + m) * 255);
    const g = Math.round((g1 + m) * 255);
    const b = Math.round((b1 + m) * 255);

    return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
  }

  private clampAlpha(value: any): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.max(0, Math.min(1, parsed));
  }

}


