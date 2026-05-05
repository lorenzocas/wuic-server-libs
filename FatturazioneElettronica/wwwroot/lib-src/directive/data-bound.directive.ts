import { ChangeDetectorRef, Directive, ElementRef, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DataSourceComponent } from '../component/data-source/data-source.component';
import { DynamicGenericTemplateComponent } from '../component/dynamic-generic-template/dynamic-generic-template.component';
import { WtoolboxService } from '../service/wtoolbox.service';

@Directive({
  selector: '[databound]',
  standalone: true
})
export class DataBoundDirective implements OnChanges {

  @Input() databound: any;
  @Input() bindingFunction: string;
  @Input() clickCallback: any;
  @Input() itemTemplate: string;
  @Input() inputs: any;

  private ds: DataSourceComponent;

  constructor(private element: ElementRef, private cd: ChangeDetectorRef) { }

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['databound'] && changes['databound'].currentValue) {
      const source = changes['databound'].currentValue as BehaviorSubject<DataSourceComponent>;
      if (!(source instanceof BehaviorSubject)) {
        return;
      }

      source.subscribe((ds) => {
        this.ds = ds;

        if (!ds || !ds.fetchInfo$ || typeof ds.fetchInfo$.subscribe !== 'function') {
          return;
        }

        ds.fetchInfo$.subscribe((info) => {
          if (this.bindingFunction) {
            new Function('resultInfo, metaInfo, inputs, wtoolbox', this.bindingFunction)(info.resultInfo, info.metaInfo, this.inputs, WtoolboxService);
            this.cd.detectChanges();
          }
        });
      });
    } else if (changes['bindingFunction'] && changes['bindingFunction'].currentValue && this.ds) {
      new Function('resultInfo, metaInfo, inputs, wtoolbox', this.bindingFunction)(this.ds.resultInfo, this.ds.metaInfo, this.inputs, WtoolboxService);
      this.cd.detectChanges();
    } else if (changes['itemTemplate'] && changes['itemTemplate'].currentValue && changes['itemTemplate'].previousValue != changes['itemTemplate'].currentValue) {
      this.inputs.itemTemplateComponent = DynamicGenericTemplateComponent.getComponentFromTemplate(this.inputs.itemTemplate || '', '[data-bound] itemTemplate (host-supplied)', String(this.ds?.metaInfo?.tableMetadata?.md_route_name || ''));
      if (this.ds) {
        await this.ds.fetchData();
      }
    } else if (changes['clickCallback'] && changes['clickCallback'].currentValue) {
      this.inputs._wtoolbox = WtoolboxService;
      this.inputs.clickCallback__fn = new Function('resultInfo, metaInfo, inputs, event, wtoolbox', this.clickCallback);
      this.cd.detectChanges();
    }
  }

}

