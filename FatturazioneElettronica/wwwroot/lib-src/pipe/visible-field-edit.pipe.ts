import { Pipe, PipeTransform } from '@angular/core';
import { MetadatiColonna } from '../class/metadati_colonna';

@Pipe({
  name: 'visibleFieldEdit',
  standalone: true
})
export class VisibleFieldEditPipe implements PipeTransform {

  transform(value: {
    field: string,
    header: string,
    metaColumn: MetadatiColonna
  }[], ...args: any): any[] {
    return value.filter((col) => {
      return !col.metaColumn.mc_hide_in_edit;
    });
  }

}
