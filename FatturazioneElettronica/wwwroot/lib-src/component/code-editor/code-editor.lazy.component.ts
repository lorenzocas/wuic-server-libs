import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetaInfo } from '../../class/metaInfo';

/**
 * Module-scope cache della promise di import dinamico di `CodeEditorComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiamerebbe `import(...)`
 * separatamente (microtask + change detection extra). Con la cache, il primo
 * arrivato innesca l'import; i successivi attendono la stessa promise gia risolta.
 *
 * IMPORTANTE per il bundle: l'`import(...)` dinamico dentro `ngOnInit` e' l'unico
 * riferimento a `./code-editor.component` da questo wrapper. Siccome
 * `code-editor.component` importa a sua volta `monaco-editor` staticamente, il
 * bundler Angular (esbuild) estrae tutta la catena (CodeEditorComponent + Monaco
 * ~3.4 MB + parser SQL/TS) in un chunk separato caricato on-demand SOLO quando
 * l'utente tocca un campo `code_editor` / `html_area`. ~85-90% degli utenti
 * non usa mai il code editor → risparmio ~3 MB sul chunk principale.
 */
let codeEditorComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-code-editor-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent; inputs: componentInputs()" />
    }
  `
})
export class LazyCodeEditorComponent implements OnInit {
  @Input() field: MetadatiColonna = new MetadatiColonna('');
  @Input() record?: { [key: string]: BehaviorSubject<any> };
  @Input() metaInfo: MetaInfo = new MetaInfo();

  loadedComponent: any = null;

  constructor(private readonly cdr: ChangeDetectorRef) { }

  async ngOnInit(): Promise<void> {
    codeEditorComponentPromise ??= import('./code-editor.component').then((m) => m.CodeEditorComponent);
    this.loadedComponent = await codeEditorComponentPromise;
    this.cdr.markForCheck();
  }

  componentInputs() {
    return {
      field: this.field,
      record: this.record,
      metaInfo: this.metaInfo
    };
  }
}
