import { Component, Input } from '@angular/core';
import { ImageModule } from 'primeng/image';

@Component({
    selector: 'wuic-image-wrapper',
    imports: [ImageModule],
    templateUrl: './image-wrapper.component.html',
    styleUrl: './image-wrapper.component.css'
})
export class ImageWrapperComponent { //Workaround for ImageModule inside RowTemplate
  /**
   * Input dal componente padre per src; usata nella configurazione e nel rendering del componente.
   */
  @Input() src: string;
  /**
   * Input dal componente padre per preview image src; usata nella configurazione e nel rendering del componente.
   */
  @Input() previewImageSrc: string;
  /**
   * Input dal componente padre per append to; usata nella configurazione e nel rendering del componente.
   */
  @Input() appendTo: any;
  /**
   * Input dal componente padre per alt; usata nella configurazione e nel rendering del componente.
   */
  @Input() alt: string;
  /**
   * Input dal componente padre per width; usata nella configurazione e nel rendering del componente.
   */
  @Input() width: string;
  /**
   * Input dal componente padre per height; usata nella configurazione e nel rendering del componente.
   */
  @Input() height: string;
  /**
   * Input dal componente padre per style; usata nella configurazione e nel rendering del componente.
   */
  @Input() style: string;
  /**
   * Input dal componente padre per style class; usata nella configurazione e nel rendering del componente.
   */
  @Input() styleClass: string;
  /**
   * Input dal componente padre per preview; usata nella configurazione e nel rendering del componente.
   */
  @Input() preview: boolean;

    /**
   * function Object() { [native code] }
   */
  constructor() { }
}


