import { Component, Input, OnInit } from '@angular/core';
import { TreeModule } from 'primeng/tree';
import { BehaviorSubject } from 'rxjs';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'wuic-tree-view-selector',
  imports: [TreeModule, AsyncPipe],
  templateUrl: './tree-view-selector.component.html',
  styleUrl: './tree-view-selector.component.css'
})
export class TreeViewSelectorComponent implements OnInit {
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
  @Input() metaInfo: any;
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
   * Input dal componente padre per nodes; usata nella configurazione e nel rendering del componente.
   */
  @Input() nodes: any[] = [];

    /**
   * function Object() { [native code] }
   */
  constructor() {

  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {
    let self = this;

    this.nodes = this.field.mc_dictionary_value ? JSON.parse(this.field.mc_dictionary_value) : []

  }

          /**
   * Gestisce la logica di `onNodeExpand` con il flusso specifico definito dalla sua implementazione.
   * @param $event Evento UI/payload evento che innesca la logica del metodo.
   */
  onNodeExpand($event) {

  }

          /**
   * Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
   * @param value Valore in ingresso elaborato o normalizzato dal metodo.
   */
  async modelChangeFn(value) {
    let newValue = value;

    this.record[this.field.mc_nome_colonna].next(newValue);

    if (this.field.mc_selection_changed_custom_function__fn) {
      await Promise.resolve(this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, newValue, this.record[this.field.mc_nome_colonna].value, null, this.nestedIndex, this.nodes));
    }
  }

}


