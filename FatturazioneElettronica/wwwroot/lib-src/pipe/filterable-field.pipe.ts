import { Pipe, PipeTransform } from '@angular/core';
import { MetaInfo } from '../class/metaInfo';

@Pipe({
  name: 'filterableField',
  standalone: true
})
export class FilterableFieldPipe implements PipeTransform {

  transform(metaInfo: MetaInfo): any[] {
    return metaInfo.columnMetadata.filter((col) => {
      return col.mc_show_in_filters;
    });
  }

}
