import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit, ViewChild } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';

/**
 * Cache module-scope della promise di import dinamico di `SpreadsheetListSfComponent`.
 * Stesso pattern del vecchio `LazySpreadsheetListComponent` (jspreadsheet):
 * con la cache, il primo arrivato innesca l'import; i successivi attendono
 * la stessa promise già risolta evitando CD extra.
 */
let spreadsheetListSfComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-spreadsheet-list-sf-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent; inputs: componentInputs()" />
    }
  `,
  // Host must be display:block + height:100% so the inner
  // SpreadsheetListSfComponent (which uses :host { height: 100% }) can resolve
  // to a non-zero height. Default inline host would collapse the chain to 0px.
  // min-height:0 to avoid flex-child overflow issues when lazy is placed inside
  // a flex column ancestor.
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
  `]
})
export class LazySpreadsheetListSfComponent implements OnInit {
  @ViewChild(NgComponentOutlet) innerOutlet?: NgComponentOutlet;

  @Input() hardcodedRoute: string;
  @Input() parentRecord: any;
  @Input() parentMetaInfo: MetaInfo;
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  @Input() hardcodedDatasource: DataSourceComponent;
  @Input() hideToolbar: boolean = false;

  loadedComponent: any = null;

  constructor(private readonly cdr: ChangeDetectorRef) { }

  async ngOnInit(): Promise<void> {
    spreadsheetListSfComponentPromise ??= import('./spreadsheet-list-sf.component').then(
      (m) => m.SpreadsheetListSfComponent
    );
    this.loadedComponent = await spreadsheetListSfComponentPromise;
    // Quando la promise e' gia' risolta dal cache module-scope (secondo mount
    // post-refresh), il microtask che risolve `await` non scatena sempre CD
    // su ancestor OnPush (es. metadata-editor sibling della bounded-repeater).
    // Senza markForCheck la @if (loadedComponent) non si aggiorna finche'
    // l'utente non triggera un evento DOM (hover, click).
    this.cdr.markForCheck();
  }

  componentInputs() {
    return {
      hardcodedRoute: this.hardcodedRoute,
      parentRecord: this.parentRecord,
      parentMetaInfo: this.parentMetaInfo,
      datasource: this.datasource,
      hardcodedDatasource: this.hardcodedDatasource,
      hideToolbar: this.hideToolbar
    };
  }
}
