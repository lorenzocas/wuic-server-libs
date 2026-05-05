import { AsyncPipe } from '@angular/common';
import { ChangeDetectorRef, Injector, OnDestroy, Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'asyncCallback',
  standalone: true,
  // pure: false
})
export class AsyncCallbackPipe implements PipeTransform, OnDestroy {
  private asyncPipe: AsyncPipe;

  constructor(private injector: Injector) {
    this.asyncPipe = new AsyncPipe(injector.get(ChangeDetectorRef));
  }

  ngOnDestroy() {
    this.asyncPipe.ngOnDestroy();
  }

  // transform(key: string): string {
  //   return this.asyncPipe.transform(this.myApiService.getText(key));
  // }

  async transform(record: any, ...args: any[]): Promise<any> {
    let context = args[0];
    let functionName = args[1];

    if (context && typeof context[functionName] === 'function') {
      args.splice(0, 2);
      return this.asyncPipe.transform(context[functionName].apply(context, args));
    }
  }

}
