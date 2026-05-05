import { Directive, OnInit, OnDestroy, Inject, ElementRef } from '@angular/core'
import { SplitGutterDirective } from './split-gutter.directive'
import { GUTTER_NUM_TOKEN } from './gutter-num-token'

@Directive({
  selector: '[asSplitGutterExcludeFromDrag]',
  standalone: true,
})
export class SplitGutterExcludeFromDragDirective implements OnInit, OnDestroy {
  constructor(
    @Inject(GUTTER_NUM_TOKEN) private gutterNum: number,
    private elementRef: ElementRef<HTMLElement>,
    private gutterDir: SplitGutterDirective,
  ) {}

  /**
   * Registra l'elemento corrente come area esclusa dal drag del gutter.
   */
  ngOnInit(): void {
    this.gutterDir.addToMap(this.gutterDir.gutterToExcludeDragElementMap, this.gutterNum, this.elementRef)
  }

  /**
   * Deregistra l'elemento escluso quando la direttiva viene distrutta.
   */
  ngOnDestroy(): void {
    this.gutterDir.removedFromMap(this.gutterDir.gutterToExcludeDragElementMap, this.gutterNum, this.elementRef)
  }
}
