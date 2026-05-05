import { Component, Input } from '@angular/core';

@Component({
    selector: 'p-tabPanel',
    imports: [],
    templateUrl: './tab-panel-wrapper.component.html',
    styleUrl: './tab-panel-wrapper.component.css',
    providers: []
})
export class TabPanelWrapperComponent {

  /**
   * Input dal componente padre per selected; usata nella configurazione e nel rendering del componente.
   */
  @Input() selected: boolean;
}


