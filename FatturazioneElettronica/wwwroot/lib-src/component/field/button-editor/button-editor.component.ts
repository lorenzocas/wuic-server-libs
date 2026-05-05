import { Component, Input } from '@angular/core';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { NgClass, NgStyle } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { MetaInfo } from '../../../class/metaInfo';
import { BehaviorSubject } from 'rxjs';

@Component({
  selector: 'wuic-button-editor',
  imports: [NgClass, NgStyle, ButtonModule],
  templateUrl: './button-editor.component.html',
  styleUrl: './button-editor.component.scss',
  providers: [ConfirmationService]
})
export class ButtonEditorComponent {

  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource?: any;
  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record?: any;
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
   * function Object() { [native code] }
   * @param confirmationService Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @param trn Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @param wtoolbox Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   */
  constructor(private confirmationService: ConfirmationService,
    private trn: TranslateService,
    private wtoolbox: WtoolboxService) {
    this.field = new MetadatiColonna('');
  }

  //BETTER TO USE A PIPE
          /**
   * Valuta una condizione tramite `isButtonVisible` con il flusso specifico definito dalla sua implementazione.
   * @returns Esito booleano calcolato dal metodo.
   */
  isButtonVisible() {
    return true;
  }

          /**
   * Gestisce la logica di `buttonExecute` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
   * @param event Evento UI/payload evento che innesca la logica del metodo.
   */
  async buttonExecute(event: Event) {
    let meta = this.field;

    if (meta.mc_button_confirm_message) {
      this.confirmationService.confirm({
        target: event.target as EventTarget,
        message: this.trn.instant(meta.mc_button_confirm_message),
        header: this.trn.instant('confirmation'),
        icon: 'pi pi-exclamation-triangle',
        acceptIcon: "none",
        rejectIcon: "none",
        rejectButtonStyleClass: "p-button-text",
        accept: async () => {

          meta.mc_button_action__fn(this.datasource, this.record, event, this.field, WtoolboxService);

          // if (meta.mc_button_executed_message) {
          //   WtoolboxService.messageNotificationService.add({ severity: 'success', summary: 'success_button', detail: this.trn.instant(meta.mc_button_executed_message) });
          // } else {
          //   WtoolboxService.messageNotificationService.add({ severity: 'success', summary: 'success_button', detail: this.trn.instant('success_button_detail') });
          // }
        },
        reject: () => {

        }
      });
    } else {

      meta.mc_button_action__fn(this.datasource, this.record, event, this.field, WtoolboxService);

      // if (meta.mc_button_executed_message) {
      //   WtoolboxService.messageNotificationService.add({ severity: 'success', summary: 'success_button', detail: this.trn.instant(meta.mc_button_executed_message) });
      // } else {
      //   WtoolboxService.messageNotificationService.add({ severity: 'success', summary: 'success_button', detail: this.trn.instant('success_button_detail') });
      // }
    }

  }
}


