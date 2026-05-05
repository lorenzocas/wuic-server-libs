import { NgComponentOutlet } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DynamicDashboardTemplateComponent } from '../dynamic-dashboard-template/dynamic-dashboard-template.component';

@Component({
    selector: 'wuic-dashboard',
    imports: [NgComponentOutlet],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.css'
})
/**
 * Renderer runtime del layout dashboard.
 *
 * Scopo del componente:
 * - ricevere il tree `dashboardElements` costruito dal designer o caricato da persistenza,
 * - risolvere dinamicamente il componente Angular per ogni nodo template/tag,
 * - passare ai componenti figli solo gli input serializzabili necessari al rendering.
 *
 * Responsabilita principali:
 * - mapping `tag -> component` tramite `DynamicDashboardTemplateComponent`,
 * - separazione tra riferimenti runtime non serializzabili e input UI effettivi,
 * - orchestrazione del rendering annidato dei blocchi dashboard nel template.
 */
export class DashboardComponent {
  // @Input() contentString: string;
  /**
   * Input dal componente padre per dashboard elements; usata nella configurazione e nel rendering del componente.
   */
  @Input() dashboardElements: any[];

    /**
   * function Object() { [native code] }
   */
  constructor() {
  }

            /**
   * Recupera i dati/valori richiesti da `getComponent`.
   * @param dashboardElement Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore risolto da `getComponent` in base ai criteri implementati.
   */
  getComponent(dashboardElement: any) {
    return DynamicDashboardTemplateComponent.getComponentFromTemplate(
      dashboardElement.tag,
      String((this as any).boardroute || (this as any).board?.boardroute || ''),
      `dom_board.boardcontent[${dashboardElement?.type || dashboardElement?.id || '?'}].tag`,
    );
  }

            /**
   * Recupera i dati/valori richiesti da `getComponentInputs`.
   * @param dashboardElement Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore risolto da `getComponentInputs` in base ai criteri implementati.
   */
  getComponentInputs(dashboardElement: any) {
    const { component, ...safeInputs } = dashboardElement || {};
    return safeInputs;
  }

          /**
   * Gestisce la logica di `onResizing` con il flusso specifico definito dalla sua implementazione.
   * @param event Evento UI/payload evento che innesca la logica del metodo.
   */
  onResizing(event) {
    debugger;
  };
}


