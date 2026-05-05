import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'callback',
  standalone: true
})
export class CallbackPipe implements PipeTransform {

  transform(items: any[], callback: (item: any) => boolean, field?: string): any {
    if (!items || !callback) {
      return items;
    }
    return items.filter(item => callback(field ? item[field] : item));
  }

}
