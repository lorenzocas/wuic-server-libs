import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'callback2',
  standalone: true
})
export class CallbackPipe2 implements PipeTransform {

  transform(items: any[], callback: any): any {
    if (!items || !callback) {
      return items;
    }
    return callback(items);
  }

}
