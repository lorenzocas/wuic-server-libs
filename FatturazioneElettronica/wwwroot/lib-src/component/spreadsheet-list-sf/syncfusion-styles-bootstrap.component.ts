import { Component, ViewEncapsulation } from '@angular/core';

/**
 * <wuic-syncfusion-styles-bootstrap>
 * ============================================================================
 * Componente "stub" che si monta dentro il lazy <wuic-spreadsheet-list-sf>
 * e dichiara via `styleUrl` lo SCSS bootstrap dei CSS globali Syncfusion
 * (~500 KiB compressi). `ViewEncapsulation.None` cosi' i selettori
 * `.e-spreadsheet`, `.e-cell`, `.e-toolbar`, ecc. che la libreria Syncfusion
 * genera a runtime ricevono effettivamente lo styling.
 *
 * Perche' non importare i CSS direttamente in `spreadsheet-list-sf.component`?
 *   - L'altro componente ha CSS LOCALI (host layout) che NON vogliamo
 *     trasformare in globali → cambiare la sua encapsulation a `None`
 *     leakerebbe quegli stili a tutta la pagina.
 *   - Splittando in 2 componenti, `spreadsheet-list-sf` mantiene scoping
 *     emulated (locale) e qui paghiamo `None` solo per i CSS Syncfusion.
 *
 * Perche' qui invece che in `angular.json:styles`?
 *   - In angular.json finivano nel bundle CSS iniziale (~500 KiB caricati
 *     anche su pagine che non aprono mai uno spreadsheet → "unused CSS"
 *     flagged da Lighthouse).
 *   - Mettendoli su un componente lazy, Angular CLI ESBuild emette il
 *     loro chunk CSS associato al chunk JS del lazy → caricati SOLO la
 *     prima volta che l'utente apre <wuic-spreadsheet-list-sf>.
 *
 * Path resolution: vedi commento in `syncfusion-styles-bootstrap.component.scss`
 * per i dettagli sull'uso di `@import '@syncfusion/...'` package-name resolved
 * (necessario per supportare sia ng-packagr che WuicTest dev via lib-src).
 */
@Component({
  selector: 'wuic-syncfusion-styles-bootstrap',
  standalone: true,
  template: '',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './syncfusion-styles-bootstrap.component.scss'
})
export class SyncfusionStylesBootstrapComponent { }
