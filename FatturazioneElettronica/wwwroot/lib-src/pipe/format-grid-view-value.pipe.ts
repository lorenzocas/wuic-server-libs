import { Pipe, PipeTransform } from '@angular/core';
import { MetadatiColonna } from '../class/metadati_colonna';

@Pipe({
  name: 'formatGridViewValue',
  standalone: true
})
export class FormatGridViewValuePipe implements PipeTransform {

  transform(rowData: unknown, metaColumn: MetadatiColonna): unknown {
    return MetadatiColonna.formatGridViewValue(metaColumn, rowData);
  }

}
