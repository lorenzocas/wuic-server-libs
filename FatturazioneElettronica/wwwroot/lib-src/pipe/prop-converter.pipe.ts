import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'propConverter',
  standalone: true
})
export class PropConverterPipe implements PipeTransform {

  transform(value: unknown, ...args: unknown[]): unknown {
    if (value) {
      if (args.length > 0) {
        if (args[0] === 'toArray') {
          return Array(parseInt(value.toString())).fill(1).map((x, i) => i);
        }

        if (args[0] === 'fromArray') {
          return (<Array<any>>value).length;
        }
      }
    }
    return null;
  }
}
