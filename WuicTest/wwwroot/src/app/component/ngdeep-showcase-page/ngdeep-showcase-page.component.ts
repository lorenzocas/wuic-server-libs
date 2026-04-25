import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import {
  DataSourceComponent,
  ListGridComponent,
  CarouselListComponent,
  LazySpreadsheetListSfComponent,
  TreeListComponent,
  MapListComponent,
  LazySchedulerListComponent,
  KanbanListComponent,
  DataRepeaterComponent,
  ImageWrapperComponent,
  ImportExportButtonComponent,
  NotificationBellComponent,
  LazyCodeEditorComponent,
  ParametricDialogComponent,
  PagerComponent,
} from 'wuic-framework-lib-dev';

@Component({
  selector: 'app-ngdeep-showcase-page',
  imports: [
    CommonModule,
    DataSourceComponent,
    ListGridComponent,
    CarouselListComponent,
    LazySpreadsheetListSfComponent,
    TreeListComponent,
    MapListComponent,
    LazySchedulerListComponent,
    KanbanListComponent,
    DataRepeaterComponent,
    ImageWrapperComponent,
    ImportExportButtonComponent,
    NotificationBellComponent,
    LazyCodeEditorComponent,
    ParametricDialogComponent,
    PagerComponent,
  ],
  templateUrl: './ngdeep-showcase-page.component.html',
  styleUrl: './ngdeep-showcase-page.component.css'
})
export class NgdeepShowcasePageComponent {
  readonly repeaterAction$ = new BehaviorSubject<string>('List');
}
