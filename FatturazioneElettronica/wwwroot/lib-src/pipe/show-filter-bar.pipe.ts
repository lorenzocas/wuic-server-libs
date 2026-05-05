import { Pipe, PipeTransform } from '@angular/core';
import { BoundedRepeaterComponent } from '../component/bounded-repeater/bounded-repeater.component';
import { MetadatiColonna } from '../class/metadati_colonna';

@Pipe({
  name: 'showFilterBar',
  standalone: true,
  pure: false
})
export class ShowFilterBarPipe implements PipeTransform {

  transform(columnMetadata: MetadatiColonna[], repeater: BoundedRepeaterComponent): boolean {
    const hasFilterableColumns = !!columnMetadata?.find((col) => col.mc_show_in_filters);
    if (!hasFilterableColumns) {
      return false;
    }

    const action = String(repeater.action?.value || '').trim().toLowerCase();

    if (action === 'list') {
      return false;
    }

    if (action === 'edit' && repeater.shouldShowEditPagerAndFilter()) {
      return true;
    }

    return false;
  }

}
