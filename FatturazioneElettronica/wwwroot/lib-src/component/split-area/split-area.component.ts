import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  Signal,
  booleanAttribute,
  computed,
  inject,
  input,
  isDevMode,
} from '@angular/core'
import { SPLIT_AREA_CONTRACT, SplitComponent } from '../split/split.component'
import { createClassesString, mirrorSignal } from '../split/helpers/utils'
import { SplitAreaSize, areaSizeTransform, boundaryAreaSizeTransform } from '../split/helpers/models'

@Component({
  selector: 'p-splitter-area',
  standalone: true,
  templateUrl: './split-area.component.html',
  styleUrl: './split-area.component.css',
  providers: [
    {
      provide: SPLIT_AREA_CONTRACT,
      useExisting: SplitAreaComponent,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SplitAreaComponent {
  /**
   * Proprieta di stato del componente per split, usata dalla logica interna e dal template.
   */
  protected readonly split = inject(SplitComponent)

  /**
   * Proprieta di stato del componente per size, usata dalla logica interna e dal template.
   */
  readonly size = input('auto', { transform: areaSizeTransform })
  /**
   * Proprieta di stato del componente per min size, usata dalla logica interna e dal template.
   */
  readonly minSize = input('*', { transform: boundaryAreaSizeTransform })
  /**
   * Proprieta di stato del componente per max size, usata dalla logica interna e dal template.
   */
  readonly maxSize = input('*', { transform: boundaryAreaSizeTransform })
  /**
   * Proprieta di stato del componente per lock size, usata dalla logica interna e dal template.
   */
  readonly lockSize = input(false, { transform: booleanAttribute })
  /**
   * Proprieta di stato del componente per visible, usata dalla logica interna e dal template.
   */
  readonly visible = input(true, { transform: booleanAttribute })

  /**
   * @internal
   */
  readonly _internalSize = mirrorSignal(
    // As size is an input and we can change the size without the outside
    // listening to the change we need an intermediate writeable signal
    /**
     * Deriva la size interna normalizzando i casi nascosti (`visible=false`) e mappando `auto` su `*`.
     */
    computed((): SplitAreaSize => {
      if (!this.visible()) {
        return 0
      }

      const size = this.size()
      // auto acts the same as * in all calculations
      return size === 'auto' ? '*' : size
    }),
  )
  /**
   * @internal
   */
  readonly _normalizedMinSize = computed(() => this.normalizeMinSize())
  /**
   * @internal
   */
  readonly _normalizedMaxSize = computed(() => this.normalizeMaxSize())
  /**
   * Indice corrente per index, usato per posizionamento o navigazione nel componente.
   */
  private readonly index = computed(() => this.split._areas().findIndex((area) => area === this))
  /**
   * Proprieta di stato del componente per grid area num, usata dalla logica interna e dal template.
   */
  private readonly gridAreaNum = computed(() => this.index() * 2 + 1)
  /**
   * Proprieta di stato del componente per host classes, usata dalla logica interna e dal template.
   */
  private readonly hostClasses = computed(() =>
    createClassesString({
      ['as-split-area']: true,
      ['as-min']: this.visible() && this._internalSize() === this._normalizedMinSize(),
      ['as-max']: this.visible() && this._internalSize() === this._normalizedMaxSize(),
      ['as-hidden']: !this.visible(),
    }),
  )

      /**
   * Gestisce la logica operativa di `hostClassesBinding` orchestrando le chiamate `hostClasses`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('class') protected get hostClassesBinding() {
    return this.hostClasses()
  }
      /**
   * Gestisce la logica operativa di `hostGridColumnStyleBinding` orchestrando le chiamate `direction` e `gridAreaNum`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('style.grid-column') protected get hostGridColumnStyleBinding() {
    return this.split.direction() === 'horizontal' ? `${this.gridAreaNum()} / ${this.gridAreaNum()}` : undefined
  }
      /**
   * Gestisce la logica operativa di `hostGridRowStyleBinding` orchestrando le chiamate `direction` e `gridAreaNum`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('style.grid-row') protected get hostGridRowStyleBinding() {
    return this.split.direction() === 'vertical' ? `${this.gridAreaNum()} / ${this.gridAreaNum()}` : undefined
  }
      /**
   * Gestisce la logica operativa di `hostPositionStyleBinding` orchestrando le chiamate `_isDragging`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('style.position') protected get hostPositionStyleBinding() {
    return this.split._isDragging() ? 'relative' : undefined
  }

            /**
   * Gestisce la logica operativa di `normalizeMinSize` in modo coerente con l'implementazione corrente.
   * @returns Risultato elaborato da `normalizeMinSize` e restituito al chiamante.
   */
  private normalizeMinSize() {
    const defaultMinSize = 0

    if (!this.visible()) {
      return defaultMinSize
    }

    const minSize = this.normalizeSizeBoundary(this.minSize, defaultMinSize)
    const size = this.size()

    if (size !== '*' && size !== 'auto' && size < minSize) {
      if (isDevMode()) {
        console.warn('as-split: size cannot be smaller than minSize')
      }

      return defaultMinSize
    }

    return minSize
  }

            /**
   * Gestisce la logica operativa di `normalizeMaxSize` in modo coerente con l'implementazione corrente.
   * @returns Risultato elaborato da `normalizeMaxSize` e restituito al chiamante.
   */
  private normalizeMaxSize() {
    const defaultMaxSize = Infinity

    if (!this.visible()) {
      return defaultMaxSize
    }

    const maxSize = this.normalizeSizeBoundary(this.maxSize, defaultMaxSize)
    const size = this.size()

    if (size !== '*' && size !== 'auto' && size > maxSize) {
      if (isDevMode()) {
        console.warn('as-split: size cannot be larger than maxSize')
      }

      return defaultMaxSize
    }

    return maxSize
  }

            /**
   * Gestisce la logica operativa di `normalizeSizeBoundary` in modo coerente con l'implementazione corrente.
   * @param sizeBoundarySignal Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param defaultBoundarySize Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore numerico prodotto da `normalizeSizeBoundary` (indice, conteggio o misura operativa).
   */
  private normalizeSizeBoundary(sizeBoundarySignal: Signal<SplitAreaSize>, defaultBoundarySize: number): number {
    const size = this.size()
    const lockSize = this.lockSize()
    const boundarySize = sizeBoundarySignal()

    if (lockSize) {
      if (isDevMode() && boundarySize !== '*') {
        console.warn('as-split: lockSize overwrites maxSize/minSize')
      }

      if (size === '*' || size === 'auto') {
        if (isDevMode()) {
          console.warn(`as-split: lockSize isn't supported on area with * size or without size`)
        }

        return defaultBoundarySize
      }

      return size
    }

    if (boundarySize === '*') {
      return defaultBoundarySize
    }

    if (size === '*' || size === 'auto') {
      if (isDevMode()) {
        console.warn('as-split: maxSize/minSize not allowed on * or without size')
      }

      return defaultBoundarySize
    }

    return boundarySize
  }
}


