import { AfterViewInit, Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { InputTextModule } from 'primeng/inputtext';
import { MetaInfo } from '../../../class/metaInfo';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { IFieldEditor } from '../../../class/IFieldEditor';
import { NgStyle } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { ColorPickerModule } from 'primeng/colorpicker';

@Component({
  selector: 'wuic-color-editor',
  imports: [FormsModule, InputTextModule, NgStyle, ColorPickerModule],
  templateUrl: './color-editor.component.html',
  styleUrl: './color-editor.component.scss'
})
export class ColorEditorComponent implements IFieldEditor, AfterViewInit {

  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record: { [key: string]: BehaviorSubject<any> };
  /**
   * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
   */
  @Input() field: MetadatiColonna;
  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: MetaInfo = new MetaInfo();
  /**
   * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
   */
  @Input() isFilter?: boolean;
  /**
   * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
   */
  @Input() nestedIndex: number;
  /**
   * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
   */
  @Input() triggerProp: BehaviorSubject<any>;
  /**
   * Input dal componente padre per tabindex; usata nella configurazione e nel rendering del componente.
   */
  @Input() tabIndex?: number;
  /**
   * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
   */
  @Input() readOnly: boolean;

  /**
   * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
   */
  valore: any;
  pickerValue: any;
  alphaValue = 1;

  /**
 * function Object() { [native code] }
 */
  constructor() {

  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit() {
    this.valore = this.record[this.field.mc_nome_colonna].value;
    if (!this.valore) {
      this.valore = '#FFFFFF';
      this.record[this.field.mc_nome_colonna].next(this.valore);
    } else {
      if (this.field.mc_selection_changed_custom_function__fn) {
        this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, this.valore, null, WtoolboxService, this.nestedIndex);
      }
    }
    this.pickerValue = this.toHsbaModel(this.valore);
    this.alphaValue = this.clampAlpha(this.pickerValue?.a);

    if (!this.field.editor) {
      this.field.editor = new BehaviorSubject<any>(null);
    }

    this.field.editor.next(this);
  }

  /**
* Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
*/
  async modelChangeFn($event) {
    const raw = $event?.value;
    this.pickerValue = {
      ...(raw || {}),
      a: this.clampAlpha(raw?.a ?? this.alphaValue)
    };
    this.alphaValue = this.clampAlpha(this.pickerValue?.a);
    const newValue = this.toPersistedColor(raw);

    this.record[this.field.mc_nome_colonna].next(newValue);

    if (this.field.mc_selection_changed_custom_function__fn) {
      await Promise.resolve(this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, newValue, this.valore, WtoolboxService, this.nestedIndex));
    }

    this.valore = newValue;

  }

  async onAlphaChange(rawAlpha: any) {
    this.alphaValue = this.clampAlpha(rawAlpha);
    this.pickerValue = {
      ...(this.pickerValue || {}),
      a: this.alphaValue
    };

    const newValue = this.toPersistedColor(this.pickerValue);
    this.record[this.field.mc_nome_colonna].next(newValue);

    if (this.field.mc_selection_changed_custom_function__fn) {
      await Promise.resolve(this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, newValue, this.valore, WtoolboxService, this.nestedIndex));
    }

    this.valore = newValue;
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


