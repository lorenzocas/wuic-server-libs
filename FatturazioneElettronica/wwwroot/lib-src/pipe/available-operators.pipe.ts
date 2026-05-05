import { Pipe, PipeTransform } from '@angular/core';
import { MetadatiColonna } from '../class/metadati_colonna';

@Pipe({
  name: 'availableOperators',
  standalone: true
})
export class AvailableOperatorsPipe implements PipeTransform {

  transform(operators: any[], field: MetadatiColonna): any[] {
    if (field.mc_ui_column_type == 'boolean') {
      return operators.filter((op) => op.key == 'eq' || op.key == 'isnull');
    }
    else if (field.mc_ui_column_type == 'date' || field.mc_ui_column_type == 'datetime') {
      return operators.filter((op) => op.key == 'eq' || op.key == 'ne' || op.key == 'gt' || op.key == 'lt' || op.key == 'gte' || op.key == 'lte' || op.key == 'isnull');
    }
    else if (field.mc_ui_column_type == 'number') {
      return operators.filter((op) => op.key == 'eq' || op.key == 'ne' || op.key == 'gt' || op.key == 'lt' || op.key == 'gte' || op.key == 'lte' || op.key == 'isnull');
    }
    else if (field.mc_ui_column_type == 'text') {
      return operators.filter((op) => op.key == 'eq' || op.key == 'ne' || op.key == 'contains' || op.key == 'startswith' || op.key == 'endswith' || op.key == 'isnull');
    }
    else if (field.mc_ui_column_type == 'lookupByID') {
      let ops = operators.filter((op) => op.key == 'eq' || op.key == 'ne' || op.key == 'isnull');
      ops.push({ key: 'eqor', value: 'multiple.choice' });

      return ops;
    }
    else if (field.mc_ui_column_type == 'multiple_check') {
      return [
        { key: 'eqor', value: 'multiple.choice.at.least.one' },
        { key: 'eqall', value: 'multiple.choice.all' }
      ];
    }

    return operators;
  }

}
