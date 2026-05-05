import { Pipe, PipeTransform } from '@angular/core';
import { UserInfoService } from '../service/user-info.service';
import { MetadatiColonna } from '../class/metadati_colonna';
import { BoundedRepeaterComponent } from '../component/bounded-repeater/bounded-repeater.component';

@Pipe({
  name: 'computeHeight',
  standalone: true
})
export class ComputeHeightPipe implements PipeTransform {

  transform(columnMetadata: MetadatiColonna[], repeater: BoundedRepeaterComponent, userService: UserInfoService): string {
    let metaEditorHeight = 50;
    let filterBarHeight = 211;

    let totHeight = 0;

    if (userService.isCurrentUserAdmin()) {
      totHeight += metaEditorHeight;
    }

    if (repeater.action?.value != 'list' && repeater.action?.value != 'dialog' && columnMetadata.find((col) => col.mc_show_in_filters)) {
      totHeight += filterBarHeight;
    }

    if (totHeight == 0) {
      return '100%';
    } else {
      return 'calc(100% - ' + totHeight + 'px)';
    }
  }

}
