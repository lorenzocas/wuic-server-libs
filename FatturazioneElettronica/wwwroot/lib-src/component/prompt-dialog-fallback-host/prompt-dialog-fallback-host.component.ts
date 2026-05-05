import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { BehaviorSubject } from 'rxjs';
import { DataSourceComponent } from '../data-source/data-source.component';
import { ParametricDialogComponent } from '../parametric-dialog/parametric-dialog.component';

type PromptDialogPosition =
  'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'topleft'
  | 'topright'
  | 'bottomleft'
  | 'bottomright';

@Component({
  selector: 'wuic-prompt-dialog-fallback-host',
  standalone: true,
  imports: [DialogModule, ParametricDialogComponent],
  template: `
    <p-dialog
      [header]="header"
      [visible]="visible"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [closable]="closable"
      [style]="dialogStyle"
      [styleClass]="styleClass"
      [position]="position"
    >
      <wuic-parametric-dialog [datasource]="datasource"></wuic-parametric-dialog>
    </p-dialog>
  `
})
export class PromptDialogFallbackHostComponent {
  @Input() datasource!: BehaviorSubject<DataSourceComponent>;
  @Input() header = '';
  @Input() width = '400px';
  @Input() height = '250px';
  @Input() styleClass = 'edit-form-content';
  @Input() position: PromptDialogPosition = 'center';
  @Input() closable = true;

  @Output() closed = new EventEmitter<any>();

  visible = true;
  private isClosed = false;

  get dialogStyle(): { [key: string]: string } {
    const style: { [key: string]: string } = {};
    if (this.width) {
      style['width'] = this.width;
    }
    if (this.height) {
      style['height'] = this.height;
    }
    return style;
  }

  closeWithResult(result: any): void {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    this.visible = false;
    this.closed.emit(result);
  }

  onVisibleChange(visible: boolean): void {
    this.visible = visible;
    if (!visible && !this.isClosed) {
      this.isClosed = true;
      this.closed.emit(null);
    }
  }
}
