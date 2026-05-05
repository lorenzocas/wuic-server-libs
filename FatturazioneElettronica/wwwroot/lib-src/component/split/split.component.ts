import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  InjectionToken,
  NgZone,
  Renderer2,
  booleanAttribute,
  computed,
  contentChild,
  contentChildren,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  DOCUMENT
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { SplitAreaComponent } from '../split-area/split-area.component'
import { Subject, filter, fromEvent, map, pairwise, skipWhile, startWith, switchMap, take, takeUntil, tap } from 'rxjs'
import {
  ClientPoint,
  createClassesString,
  gutterEventsEqualWithDelta,
  fromMouseMoveEvent,
  fromMouseUpEvent,
  getPointFromEvent,
  leaveNgZone,
  numberAttributeWithFallback,
  sum,
  toRecord,
} from './helpers/utils'
import { NgStyle, NgTemplateOutlet } from '@angular/common'
import { SplitGutterInteractionEvent, SplitAreaSize } from './helpers/models'
import { SplitCustomEventsBehaviorDirective } from './helpers/split-custom-events-behavior.directive'
import { areAreasValid } from './helpers/validations'
import { SplitGutterDirective } from './gutter/split-gutter.directive'
import { SplitGutterDynamicInjectorDirective } from './gutter/split-gutter-dynamic-injector.directive'
import { ANGULAR_SPLIT_DEFAULT_OPTIONS } from './helpers/angular-split-config.token'

interface MouseDownContext {
  mouseDownEvent: MouseEvent | TouchEvent
  gutterIndex: number
  gutterElement: HTMLElement
  areaBeforeGutterIndex: number
  areaAfterGutterIndex: number
}

interface AreaBoundary {
  min: number
  max: number
}

interface DragStartContext {
  startEvent: MouseEvent | TouchEvent | KeyboardEvent
  areasPixelSizes: number[]
  totalAreasPixelSize: number
  areaIndexToBoundaries: Record<number, AreaBoundary>
  areaBeforeGutterIndex: number
  areaAfterGutterIndex: number
}

export const SPLIT_AREA_CONTRACT = new InjectionToken<SplitAreaComponent>('Split Area Contract')

//https://angular-split.github.io/documentation

@Component({
    selector: 'p-splitter',
    imports: [NgStyle, SplitCustomEventsBehaviorDirective, SplitGutterDynamicInjectorDirective, NgTemplateOutlet],
    templateUrl: './split.component.html',
    styleUrl: './split.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SplitComponent {
  /**
   * Proprieta di stato del componente per document, usata dalla logica interna e dal template.
   */
  private readonly document = inject(DOCUMENT)
  /**
   * Proprieta di stato del componente per renderer, usata dalla logica interna e dal template.
   */
  private readonly renderer = inject(Renderer2)
  /**
   * Proprieta di stato del componente per element ref, usata dalla logica interna e dal template.
   */
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef)
  /**
   * Proprieta di stato del componente per ng zone, usata dalla logica interna e dal template.
   */
  private readonly ngZone = inject(NgZone)
  /**
   * Collezione dati per default options, consumata dal rendering e dalle operazioni del componente.
   */
  private readonly defaultOptions = inject(ANGULAR_SPLIT_DEFAULT_OPTIONS)

  /**
   * Proprieta di stato del componente per gutter mouse down subject, usata dalla logica interna e dal template.
   */
  private readonly gutterMouseDownSubject = new Subject<MouseDownContext>()
  /**
   * Proprieta di stato del componente per drag progress subject, usata dalla logica interna e dal template.
   */
  private readonly dragProgressSubject = new Subject<SplitGutterInteractionEvent>()

  /**
   * @internal
   */
  readonly _areas = contentChildren(SPLIT_AREA_CONTRACT)
  /**
   * Proprieta di stato del componente per custom gutter, usata dalla logica interna e dal template.
   */
  protected readonly customGutter = contentChild(SplitGutterDirective)
  /**
   * Proprieta di stato del componente per gutter size, usata dalla logica interna e dal template.
   */
  readonly gutterSize = input(this.defaultOptions.gutterSize, {
    transform: numberAttributeWithFallback(this.defaultOptions.gutterSize),
  })
  /**
   * Proprieta di stato del componente per gutter step, usata dalla logica interna e dal template.
   */
  readonly gutterStep = input(this.defaultOptions.gutterStep, {
    transform: numberAttributeWithFallback(this.defaultOptions.gutterStep),
  })
  /**
   * Proprieta di stato del componente per disabled, usata dalla logica interna e dal template.
   */
  readonly disabled = input(this.defaultOptions.disabled, { transform: booleanAttribute })
  /**
   * Proprieta di stato del componente per gutter click delta px, usata dalla logica interna e dal template.
   */
  readonly gutterClickDeltaPx = input(this.defaultOptions.gutterClickDeltaPx, {
    transform: numberAttributeWithFallback(this.defaultOptions.gutterClickDeltaPx),
  })
  /**
   * Proprieta di stato del componente per direction, usata dalla logica interna e dal template.
   */
  readonly direction = input(this.defaultOptions.direction)
  /**
   * Proprieta di stato del componente per dir, usata dalla logica interna e dal template.
   */
  readonly dir = input(this.defaultOptions.dir)
  /**
   * Proprieta di stato del componente per unit, usata dalla logica interna e dal template.
   */
  readonly unit = input(this.defaultOptions.unit)
  /**
   * Proprieta di stato del componente per gutter aria label, usata dalla logica interna e dal template.
   */
  readonly gutterAriaLabel = input<string>()
  /**
   * Proprieta di stato del componente per restrict move, usata dalla logica interna e dal template.
   */
  readonly restrictMove = input(this.defaultOptions.restrictMove, { transform: booleanAttribute })
  /**
   * Proprieta di stato del componente per use transition, usata dalla logica interna e dal template.
   */
  readonly useTransition = input(this.defaultOptions.useTransition, { transform: booleanAttribute })
  /**
   * Proprieta di stato del componente per gutter dbl click duration, usata dalla logica interna e dal template.
   */
  readonly gutterDblClickDuration = input(this.defaultOptions.gutterDblClickDuration, {
    transform: numberAttributeWithFallback(this.defaultOptions.gutterDblClickDuration),
  })
  /**
   * Proprieta di stato del componente per gutter click, usata dalla logica interna e dal template.
   */
  readonly gutterClick = output<SplitGutterInteractionEvent>()
  /**
   * Proprieta di stato del componente per gutter dbl click, usata dalla logica interna e dal template.
   */
  readonly gutterDblClick = output<SplitGutterInteractionEvent>()
  /**
   * Proprieta di stato del componente per drag start, usata dalla logica interna e dal template.
   */
  readonly dragStart = output<SplitGutterInteractionEvent>()
  /**
   * Proprieta di stato del componente per drag end, usata dalla logica interna e dal template.
   */
  readonly dragEnd = output<SplitGutterInteractionEvent>()
  /**
   * Proprieta di stato del componente per transition end, usata dalla logica interna e dal template.
   */
  readonly transitionEnd = output<SplitAreaSize[]>()

  /**
   * Stream osservabile per drag progress$, usato per propagare aggiornamenti reattivi nel componente.
   */
  readonly dragProgress$ = this.dragProgressSubject.asObservable()

  /**
   * Proprieta di stato del componente per visible areas, usata dalla logica interna e dal template.
   */
  private readonly visibleAreas = computed(() => this._areas().filter((area) => area.visible()))
  /**
   * Configurazione di presentazione per grid template columns style, usata nel rendering del componente.
   */
  private readonly gridTemplateColumnsStyle = computed(() => {
    const columns: string[] = []
    const sumNonWildcardSizes = sum(this.visibleAreas(), (area) => {
      const size = area._internalSize()
      return size === '*' ? 0 : size
    })
    const visibleAreasCount = this.visibleAreas().length

    let visitedVisibleAreas = 0

    this._areas().forEach((area, index, areas) => {
      const unit = this.unit()
      const areaSize = area._internalSize()

      // Add area size column
      if (!area.visible()) {
        columns.push(unit === 'percent' || areaSize === '*' ? '0fr' : '0px')
      } else {
        if (unit === 'pixel') {
          const columnValue = areaSize === '*' ? '1fr' : `${areaSize}px`
          columns.push(columnValue)
        } else {
          const percentSize = areaSize === '*' ? 100 - sumNonWildcardSizes : areaSize
          const columnValue = `${percentSize}fr`
          columns.push(columnValue)
        }

        visitedVisibleAreas++
      }

      const isLastArea = index === areas.length - 1

      if (isLastArea) {
        return
      }

      const remainingVisibleAreas = visibleAreasCount - visitedVisibleAreas

      // Only add gutter with size if this area is visible and there are more visible areas after this one
      // to avoid ghost gutters
      if (area.visible() && remainingVisibleAreas > 0) {
        columns.push(`${this.gutterSize()}px`)
      } else {
        columns.push('0px')
      }
    })

    return this.direction() === 'horizontal' ? `1fr / ${columns.join(' ')}` : `${columns.join(' ')} / 1fr`
  })
  /**
   * Proprieta di stato del componente per host classes, usata dalla logica interna e dal template.
   */
  private readonly hostClasses = computed(() =>
    createClassesString({
      [`as-${this.direction()}`]: true,
      [`as-${this.unit()}`]: true,
      ['as-disabled']: this.disabled(),
      ['as-dragging']: this._isDragging(),
      ['as-transition']: this.useTransition() && !this._isDragging(),
    }),
  )
  /**
   * Indice corrente per dragged gutter index, usato per posizionamento o navigazione nel componente.
   */
  protected readonly draggedGutterIndex = signal<number>(undefined)
  /**
   * @internal
   */
  readonly _isDragging = computed(() => this.draggedGutterIndex() !== undefined)

      /**
   * Gestisce la logica operativa di `hostClassesBinding` orchestrando le chiamate `hostClasses`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('class') protected get hostClassesBinding() {
    return this.hostClasses()
  }

      /**
   * Gestisce la logica operativa di `hostDirBinding` orchestrando le chiamate `dir`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('dir') protected get hostDirBinding() {
    return this.dir()
  }

    /**
   * function Object() { [native code] }
   */
  constructor() {
    effect(
      () => {
        const visibleAreas = this.visibleAreas()
        const unit = this.unit()
        const isInAutoMode = visibleAreas.every((area) => area.size() === 'auto')

        untracked(() => {
          // Special mode when no size input was declared which is a valid mode
          if (unit === 'percent' && visibleAreas.length > 1 && isInAutoMode) {
            visibleAreas.forEach((area) => area._internalSize.set(100 / visibleAreas.length))
            return
          }

          visibleAreas.forEach((area) => area._internalSize.reset())

          const isValid = areAreasValid(visibleAreas, unit)

          if (isValid) {
            return
          }

          if (unit === 'percent') {
            // Distribute sizes equally
            const defaultSize = 100 / visibleAreas.length
            visibleAreas.forEach((area) => area._internalSize.set(defaultSize))
          } else if (unit === 'pixel') {
            const wildcardAreas = visibleAreas.filter((area) => area._internalSize() === '*')

            // Make sure only one wildcard area
            if (wildcardAreas.length === 0) {
              visibleAreas[0]._internalSize.set('*')
            } else if (wildcardAreas.length > 1) {
              wildcardAreas.filter((_, i) => i !== 0).forEach((area) => area._internalSize.set(100))
            }
          }
        })
      },
      { allowSignalWrites: true },
    )

    // Responsible for updating grid template style. Must be this way and not based on HostBinding
    // as change detection for host binding is bound to the parent component and this style
    // is updated on every mouse move. Doing it this way will prevent change detection cycles in parent.
    effect(() => {
      const gridTemplateColumnsStyle = this.gridTemplateColumnsStyle()
      this.renderer.setStyle(this.elementRef.nativeElement, 'grid-template', gridTemplateColumnsStyle)
    })

    this.gutterMouseDownSubject
      .pipe(
        filter(
          (context) =>
            !this.customGutter() ||
            this.customGutter().canStartDragging(context.mouseDownEvent.target as HTMLElement, context.gutterIndex + 1),
        ),
        switchMap((mouseDownContext) =>
          // As we have gutterClickDeltaPx we can't just start the drag but need to make sure
          // we are out of the delta pixels. As the delta can be any number we make sure
          // we always start the drag if we go out of the gutter (delta based on mouse position is larger than gutter).
          // As moving can start inside the drag and end outside of it we always keep track of the previous event
          // so once the current is out of the delta size we use the previous one as the drag start baseline.
          fromMouseMoveEvent(this.document).pipe(
            startWith(mouseDownContext.mouseDownEvent),
            pairwise(),
            skipWhile(([, currMoveEvent]) =>
              gutterEventsEqualWithDelta(
                mouseDownContext.mouseDownEvent,
                currMoveEvent,
                this.gutterClickDeltaPx(),
                mouseDownContext.gutterElement,
              ),
            ),
            take(1),
            takeUntil(fromMouseUpEvent(this.document, true)),
            tap(() => {
              this.ngZone.run(() => {
                this.dragStart.emit(this.createDragInteractionEvent(mouseDownContext.gutterIndex))
                this.draggedGutterIndex.set(mouseDownContext.gutterIndex)
              })
            }),
            map(([prevMouseEvent]) =>
              this.createDragStartContext(
                prevMouseEvent,
                mouseDownContext.areaBeforeGutterIndex,
                mouseDownContext.areaAfterGutterIndex,
              ),
            ),
            switchMap((dragStartContext) =>
              fromMouseMoveEvent(this.document).pipe(
                tap((moveEvent) => this.mouseDragMove(moveEvent, dragStartContext)),
                takeUntil(fromMouseUpEvent(this.document, true)),
                tap({
                  complete: () =>
                    this.ngZone.run(() => {
                      this.dragEnd.emit(this.createDragInteractionEvent(this.draggedGutterIndex()))
                      this.draggedGutterIndex.set(undefined)
                    }),
                }),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe()

    fromEvent<TransitionEvent>(this.elementRef.nativeElement, 'transitionend')
      .pipe(
        filter((e) => e.propertyName.startsWith('grid-template')),
        leaveNgZone(),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.ngZone.run(() => this.transitionEnd.emit(this.createAreaSizes())))
  }

            /**
   * Gestisce la logica operativa di `gutterClicked` in modo coerente con l'implementazione corrente.
   * @param gutterIndex Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  protected gutterClicked(gutterIndex: number) {
    this.ngZone.run(() => this.gutterClick.emit(this.createDragInteractionEvent(gutterIndex)))
  }

            /**
   * Gestisce la logica operativa di `gutterDoubleClicked` in modo coerente con l'implementazione corrente.
   * @param gutterIndex Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  protected gutterDoubleClicked(gutterIndex: number) {
    this.ngZone.run(() => this.gutterDblClick.emit(this.createDragInteractionEvent(gutterIndex)))
  }

            /**
   * Gestisce la logica operativa di `gutterMouseDown` in modo coerente con l'implementazione corrente.
   * @param e Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param gutterElement Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param gutterIndex Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param areaBeforeGutterIndex Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param areaAfterGutterIndex Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  protected gutterMouseDown(
    e: MouseEvent | TouchEvent,
    gutterElement: HTMLElement,
    gutterIndex: number,
    areaBeforeGutterIndex: number,
    areaAfterGutterIndex: number,
  ) {
    if (this.disabled()) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    this.gutterMouseDownSubject.next({
      mouseDownEvent: e,
      gutterElement,
      gutterIndex,
      areaBeforeGutterIndex,
      areaAfterGutterIndex,
    })
  }

            /**
   * Gestisce la logica operativa di `gutterKeyDown` in modo coerente con l'implementazione corrente.
   * @param e Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param gutterIndex Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param areaBeforeGutterIndex Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param areaAfterGutterIndex Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  protected gutterKeyDown(
    e: KeyboardEvent,
    gutterIndex: number,
    areaBeforeGutterIndex: number,
    areaAfterGutterIndex: number,
  ) {
    if (this.disabled()) {
      return
    }

    const pixelsToMove = 50
    const pageMoveMultiplier = 10

    let xPointOffset = 0
    let yPointOffset = 0

    if (this.direction() === 'horizontal') {
      // Even though we are going in the x axis we support page up and down
      switch (e.key) {
        case 'ArrowLeft':
          xPointOffset -= pixelsToMove
          break
        case 'ArrowRight':
          xPointOffset += pixelsToMove
          break
        case 'PageUp':
          if (this.dir() === 'rtl') {
            xPointOffset -= pixelsToMove * pageMoveMultiplier
          } else {
            xPointOffset += pixelsToMove * pageMoveMultiplier
          }
          break
        case 'PageDown':
          if (this.dir() === 'rtl') {
            xPointOffset += pixelsToMove * pageMoveMultiplier
          } else {
            xPointOffset -= pixelsToMove * pageMoveMultiplier
          }
          break
        default:
          return
      }
    } else {
      switch (e.key) {
        case 'ArrowUp':
          yPointOffset -= pixelsToMove
          break
        case 'ArrowDown':
          yPointOffset += pixelsToMove
          break
        case 'PageUp':
          yPointOffset -= pixelsToMove * pageMoveMultiplier
          break
        case 'PageDown':
          yPointOffset += pixelsToMove * pageMoveMultiplier
          break
        default:
          return
      }
    }

    e.preventDefault()
    e.stopPropagation()

    const gutterMidPoint = getPointFromEvent(e)
    const dragStartContext = this.createDragStartContext(e, areaBeforeGutterIndex, areaAfterGutterIndex)

    this.ngZone.run(() => {
      this.dragStart.emit(this.createDragInteractionEvent(gutterIndex))
      this.draggedGutterIndex.set(gutterIndex)
    })

    this.dragMoveToPoint({ x: gutterMidPoint.x + xPointOffset, y: gutterMidPoint.y + yPointOffset }, dragStartContext)

    this.ngZone.run(() => {
      this.dragEnd.emit(this.createDragInteractionEvent(gutterIndex))
      this.draggedGutterIndex.set(undefined)
    })
  }

            /**
   * Recupera i dati/valori richiesti da `getGutterGridStyle`.
   * @param nextAreaIndex Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Oggetto risultato costruito da `getGutterGridStyle` per i passi successivi del flusso.
   */
  protected getGutterGridStyle(nextAreaIndex: number) {
    const gutterNum = nextAreaIndex * 2
    const style = `${gutterNum} / ${gutterNum}`

    return {
      ['grid-column']: this.direction() === 'horizontal' ? style : '1',
      ['grid-row']: this.direction() === 'vertical' ? style : '1',
    }
  }

            /**
   * Recupera i dati/valori richiesti da `getAriaAreaSizeText`.
   * @param area Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Stringa risultante calcolata da `getAriaAreaSizeText` per chiavi/label o valori testuali.
   */
  protected getAriaAreaSizeText(area: SplitAreaComponent): string {
    const size = area._internalSize()

    if (size === '*') {
      return undefined
    }

    return `${size.toFixed(0)} ${this.unit()}`
  }

            /**
   * Recupera i dati/valori richiesti da `getAriaValue`.
   * @param size Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore risolto da `getAriaValue` in base ai criteri implementati.
   */
  protected getAriaValue(size: SplitAreaSize) {
    return size === '*' ? undefined : size
  }

              /**
   * Costruisce il payload/struttura risultante in `createDragInteractionEvent` partendo dai dati correnti.
   * @param gutterIndex Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore di tipo `SplitGutterInteractionEvent` prodotto da `createDragInteractionEvent`.
   */
  private createDragInteractionEvent(gutterIndex: number): SplitGutterInteractionEvent {
    return {
      gutterNum: gutterIndex + 1,
      sizes: this.createAreaSizes(),
    }
  }

            /**
   * Costruisce il payload/struttura risultante in `createAreaSizes` partendo dai dati correnti.
   * @returns Struttura dati prodotta da `createAreaSizes` dopo normalizzazione/elaborazione.
   */
  private createAreaSizes() {
    return this.visibleAreas().map((area) => area._internalSize())
  }

        /**
   * Costruisce una struttura di output a partire dal contesto corrente normalizzando e trasformando collezioni di record.
   * @param startEvent Evento o payload evento da cui il metodo ricava input operativi.
   * @param areaBeforeGutterIndex Parametro in ingresso usato per determinare il flusso operativo del metodo.
   * @param areaAfterGutterIndex Parametro in ingresso usato per determinare il flusso operativo del metodo.
   * @returns Valore di tipo `DragStartContext` costruito dal metodo per i passaggi successivi del flusso.
   */
  private createDragStartContext(
    startEvent: MouseEvent | TouchEvent | KeyboardEvent,
    areaBeforeGutterIndex: number,
    areaAfterGutterIndex: number,
  ): DragStartContext {
    const splitBoundingRect = this.elementRef.nativeElement.getBoundingClientRect()
    const splitSize = this.direction() === 'horizontal' ? splitBoundingRect.width : splitBoundingRect.height
    const totalAreasPixelSize = splitSize - (this.visibleAreas().length - 1) * this.gutterSize()
    // Use the internal size and split size to calculate the pixel size from wildcard and percent areas
    const areaPixelSizesWithWildcard = this._areas().map((area) => {
      if (this.unit() === 'pixel') {
        return area._internalSize()
      } else {
        const size = area._internalSize()

        if (size === '*') {
          return size
        }

        return (size / 100) * totalAreasPixelSize
      }
    })
    const remainingSize = Math.max(
      0,
      totalAreasPixelSize - sum(areaPixelSizesWithWildcard, (size) => (size === '*' ? 0 : size)),
    )
    const areasPixelSizes = areaPixelSizesWithWildcard.map((size) => (size === '*' ? remainingSize : size))

    return {
      startEvent,
      areaBeforeGutterIndex,
      areaAfterGutterIndex,
      areasPixelSizes,
      totalAreasPixelSize,
      areaIndexToBoundaries: toRecord(this._areas(), (area, index) => {
        const percentToPixels = (percent: number) => (percent / 100) * totalAreasPixelSize

        const value: AreaBoundary =
          this.unit() === 'pixel'
            ? {
              min: area._normalizedMinSize(),
              max: area._normalizedMaxSize(),
            }
            : {
              min: percentToPixels(area._normalizedMinSize()),
              max: percentToPixels(area._normalizedMaxSize()),
            }

        return [index.toString(), value]
      }),
    }
  }

            /**
   * Gestisce la logica operativa di `mouseDragMove` in modo coerente con l'implementazione corrente.
   * @param moveEvent Evento che innesca il comportamento del metodo.
   * @param dragStartContext Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private mouseDragMove(moveEvent: MouseEvent | TouchEvent, dragStartContext: DragStartContext) {
    moveEvent.preventDefault()
    moveEvent.stopPropagation()

    const endPoint = getPointFromEvent(moveEvent)

    this.dragMoveToPoint(endPoint, dragStartContext)
  }

            /**
   * Gestisce la logica operativa di `dragMoveToPoint` in modo coerente con l'implementazione corrente.
   * @param endPoint Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param dragStartContext Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private dragMoveToPoint(endPoint: ClientPoint, dragStartContext: DragStartContext) {
    const startPoint = getPointFromEvent(dragStartContext.startEvent)
    const preDirOffset = this.direction() === 'horizontal' ? endPoint.x - startPoint.x : endPoint.y - startPoint.y
    const offset = this.direction() === 'horizontal' && this.dir() === 'rtl' ? -preDirOffset : preDirOffset
    const isDraggingForward = offset > 0
    // Align offset with gutter step and abs it as we need absolute pixels movement
    const absSteppedOffset = Math.abs(Math.round(offset / this.gutterStep()) * this.gutterStep())
    // Copy as we don't want to edit the original array
    const tempAreasPixelSizes = [...dragStartContext.areasPixelSizes]
    // As we are going to shuffle the areas order for easier iterations we should work with area indices array
    // instead of actual area sizes array.
    const areasIndices = tempAreasPixelSizes.map((_, index) => index)
    // The two variables below are ordered for iterations with real area indices inside.
    // We must also remove the invisible ones as we can't expand or shrink them.
    const areasIndicesBeforeGutter = this.restrictMove()
      ? [dragStartContext.areaBeforeGutterIndex]
      : areasIndices
        .slice(0, dragStartContext.areaBeforeGutterIndex + 1)
        .filter((index) => this._areas()[index].visible())
        .reverse()
    const areasIndicesAfterGutter = this.restrictMove()
      ? [dragStartContext.areaAfterGutterIndex]
      : areasIndices.slice(dragStartContext.areaAfterGutterIndex).filter((index) => this._areas()[index].visible())
    // Based on direction we need to decide which areas are expanding and which are shrinking
    const potentialAreasIndicesArrToShrink = isDraggingForward ? areasIndicesAfterGutter : areasIndicesBeforeGutter
    const potentialAreasIndicesArrToExpand = isDraggingForward ? areasIndicesBeforeGutter : areasIndicesAfterGutter

    let remainingPixels = absSteppedOffset
    let potentialShrinkArrIndex = 0
    let potentialExpandArrIndex = 0

    // We gradually run in both expand and shrink direction transferring pixels from the offset.
    // We stop once no pixels are left or we reached the end of either the expanding areas or the shrinking areas
    while (
      remainingPixels !== 0 &&
      potentialShrinkArrIndex < potentialAreasIndicesArrToShrink.length &&
      potentialExpandArrIndex < potentialAreasIndicesArrToExpand.length
    ) {
      const areaIndexToShrink = potentialAreasIndicesArrToShrink[potentialShrinkArrIndex]
      const areaIndexToExpand = potentialAreasIndicesArrToExpand[potentialExpandArrIndex]
      const areaToShrinkSize = tempAreasPixelSizes[areaIndexToShrink]
      const areaToExpandSize = tempAreasPixelSizes[areaIndexToExpand]
      const areaToShrinkMinSize = dragStartContext.areaIndexToBoundaries[areaIndexToShrink].min
      const areaToExpandMaxSize = dragStartContext.areaIndexToBoundaries[areaIndexToExpand].max
      // We can only transfer pixels based on the shrinking area min size and the expanding area max size
      // to avoid overflow. If any pixels left they will be handled by the next area in the next `while` iteration
      const maxPixelsToShrink = areaToShrinkSize - areaToShrinkMinSize
      const maxPixelsToExpand = areaToExpandMaxSize - areaToExpandSize
      const pixelsToTransfer = Math.min(maxPixelsToShrink, maxPixelsToExpand, remainingPixels)

      // Actual pixels transfer
      tempAreasPixelSizes[areaIndexToShrink] -= pixelsToTransfer
      tempAreasPixelSizes[areaIndexToExpand] += pixelsToTransfer
      remainingPixels -= pixelsToTransfer

      // Once min threshold reached we need to move to the next area in turn
      if (tempAreasPixelSizes[areaIndexToShrink] === areaToShrinkMinSize) {
        potentialShrinkArrIndex++
      }

      // Once max threshold reached we need to move to the next area in turn
      if (tempAreasPixelSizes[areaIndexToExpand] === areaToExpandMaxSize) {
        potentialExpandArrIndex++
      }
    }

    this._areas().forEach((area, index) => {
      // No need to update wildcard size
      if (area._internalSize() === '*') {
        return
      }

      if (this.unit() === 'pixel') {
        area._internalSize.set(tempAreasPixelSizes[index])
      } else {
        const percentSize = (tempAreasPixelSizes[index] / dragStartContext.totalAreasPixelSize) * 100
        // Fix javascript only working with float numbers which are inaccurate compared to decimals
        area._internalSize.set(parseFloat(percentSize.toFixed(10)))
      }
    })

    this.dragProgressSubject.next(this.createDragInteractionEvent(this.draggedGutterIndex()))
  }
}


