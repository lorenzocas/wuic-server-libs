import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'getInputs',
  standalone: true
})
export class GetInputsPipe implements PipeTransform {

  transform(fieldEditor: any): any {
    return {
      record: fieldEditor.record,
      field: fieldEditor.field,
      metaInfo: fieldEditor.metaInfo,
      isFilter: fieldEditor.isFilter
    };
  }

}
