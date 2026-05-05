import { Pipe, PipeTransform } from '@angular/core';
import { MetaInfo } from '../class/metaInfo';

@Pipe({
  name: 'isSelectedRow',
  standalone: true
})
export class IsSelectedRowPipe implements PipeTransform {

  transform(items: any[], rowData: any, metaInfo: MetaInfo): any {
    if (!items || !rowData || !metaInfo) {
      return false;
    }
    let match = items.find(item => {
      return item[metaInfo.pKey.mc_nome_colonna] == rowData[metaInfo.pKey.mc_nome_colonna];
    });

    return match != null ? true : false;
  }

}
