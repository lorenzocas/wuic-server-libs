import { NgIterable, Pipe, PipeTransform } from '@angular/core';
import { MetadatiColonna } from '../class/metadati_colonna';

@Pipe({
  name: 'visibleFieldList',
  standalone: true
})
export class VisibleFieldListPipe implements PipeTransform {

  transform(value: any[], ...args: any): any[] {
    return value.filter((col) => {
      if (col && typeof col.hidden === 'boolean') {
        return !col.hidden;
      }
      return col.metaColumn ? !col.metaColumn.mc_hide_in_list : !col.mc_hide_in_list;
    });
  }

}
