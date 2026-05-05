import { NgClass } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
    selector: 'p-tabView',
    imports: [NgClass],
    templateUrl: './tab-view-wrapper.component.html',
    styleUrl: './tab-view-wrapper.component.css'
})
export class TabViewWrapperComponent {
  /**
   * Input dal componente padre per tabs; usata nella configurazione e nel rendering del componente.
   */
  @Input() tabs: any[];
  /**
   * Input dal componente padre per active index; usata nella configurazione e nel rendering del componente.
   */
  @Input() activeIndex: number;

            /**
   * Applica aggiornamenti di stato tramite `setIndex` mantenendo coerenti UI e dati.
   * @param i Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  setIndex(i) {
    this.activeIndex = i;
    this.tabs.forEach((tab, index) => {
      if (index === i) {
        tab.inputs.selected = true;
      } else {
        tab.inputs.selected = false;
      }
    });
  }
}


