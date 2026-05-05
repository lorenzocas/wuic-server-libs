import { Component, Input } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetaInfo } from '../../../class/metaInfo';
import { LazyCodeEditorComponent } from '../../code-editor/code-editor.lazy.component';
import { TextAreaEditorComponent } from '../text-area-editor/text-area-editor.component';

/**
 * CodeEditorComponent (Monaco-based, ~3.4 MB) viene istanziato SOLO attraverso
 * il wrapper `LazyCodeEditorComponent`, che fa l'`import('./code-editor.component')`
 * dinamico in ngOnInit. Questa scelta e' CRITICA per il code-splitting:
 *
 * - Il wrapper `LazyCodeEditorComponent` nel suo `imports:` non referenzia
 *   staticamente `CodeEditorComponent` — e' un `import()` dinamico.
 * - Monaco-editor dichiara `sideEffects: true` (default implicito, package.json
 *   senza `sideEffects: false`) → il tree-shaker di esbuild NON puo' eliminarlo
 *   via dead-code-elimination: l'unica via per tenerlo fuori dal chunk
 *   principale e' NON citarlo in un grafo di import statici.
 * - Prima di questa refactor: `imports: [CodeEditorComponent, ...]` importava
 *   staticamente il componente → Monaco finiva nel chunk principale (~3.4 MB)
 *   anche per utenti che non aprono mai il code-editor.
 * - Dopo: il blocco `@defer` mostra `<wuic-code-editor-lazy>` solo quando
 *   l'utente attiva l'editor. `LazyCodeEditorComponent` a sua volta fa
 *   `import('./code-editor.component')` dinamico → esbuild estrae Monaco +
 *   CodeEditorComponent + parser SQL/TS in un chunk separato caricato on-demand.
 */
@Component({
    selector: 'lib-code-area-editor',
    imports: [LazyCodeEditorComponent, TextAreaEditorComponent],
    templateUrl: './code-area-editor.component.html',
    styleUrl: './code-area-editor.component.css'
})
export class CodeAreaEditorComponent {
  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record?: { [key: string]: BehaviorSubject<any> };
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
   * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
   */
  @Input() readOnly: boolean;
  /**
   * Tabindex assegnato dinamicamente dal parent in base all'ordine campi del form.
   */
  @Input() tabIndex?: number;

  /**
   * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
   */
  valore: any;

    /**
   * function Object() { [native code] }
   */
  constructor() {

  }

          /**
   * Gestisce comportamento UI tramite `toggleEditor` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
   * @returns Esito booleano calcolato dal metodo.
   */
  toggleEditor() {
    if (!this.field.codeEditing) {
      this.metaInfo.columnMetadata.forEach((col) => {
        if (col.mc_nome_colonna != this.field.mc_nome_colonna && col.codeEditing) {
          col.codeEditing = false;
        }
      });
    }

    this.field.codeEditing = !this.field.codeEditing;
    return false;
  }
}


