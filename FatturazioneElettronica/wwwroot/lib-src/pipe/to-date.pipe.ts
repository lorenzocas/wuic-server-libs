import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'toDate',
  standalone: true
})
export class ToDatePipe implements PipeTransform {

  transform(value: string, ...args: unknown[]): unknown {
    return value ? new Date(value) : null;
  }

}
