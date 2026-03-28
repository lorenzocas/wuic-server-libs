import { Component, Input, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Title } from '@angular/platform-browser';
import type { DataSourceComponent } from 'wuic-framework-lib-src/component/data-source/data-source.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-custom-list',
  imports: [CommonModule],
  templateUrl: './custom-list.component.html',
  styleUrl: './custom-list.component.css'
})
export class CustomListComponent implements OnDestroy {

  @Input() hardcodedRoute: string = '';
  @Input() datasource: BehaviorSubject<DataSourceComponent> = null as any;
  @Input() hardcodedDatasource: DataSourceComponent | null = null;

  records: any[] = [];
  metaInfo: any;
  routeName: string = '';
  totalRecords: number = 0;
  pageSize: number = 10;
  rowNumber: number = 0;
  loading: boolean = false;
  pageIndex: number = 0;
  initCompleted: boolean = false;

  private datasourceReadySubscription?: Subscription;
  private fetchInfoSubscription?: Subscription;

  constructor(private titleService: Title) {}

  async ngOnInit() {
    if (this.hardcodedDatasource) {
      this.datasource = new BehaviorSubject<DataSourceComponent>(this.hardcodedDatasource);
      this.subscribeToDS();
    } else if (this.datasource && this.datasource.value) {
      this.subscribeToDS();
    }
  }

  async subscribeToDS() {
    const self = this;

    this.fetchInfoSubscription?.unsubscribe();
    this.fetchInfoSubscription = self.datasource.value.fetchInfo.subscribe(async (info) => {
      if (!info) {
        return;
      }

      self.metaInfo = info.metaInfo;

      if (!self.initCompleted) {
        const title = self.metaInfo.tableMetadata.md_display_string;
        self.titleService.setTitle(title);
        await self.datasource.value.fetchData();
        self.initCompleted = true;
      } else {
        self.records = self.parseData(info.resultInfo.dato);
      }
    });
  }

  ngOnDestroy(): void {
    this.datasourceReadySubscription?.unsubscribe();
    this.fetchInfoSubscription?.unsubscribe();
  }

  getVisibleColumns(): any[] {
    const cols = this.datasource?.value?.metaInfo?.columnMetadata || [];
    return cols.filter((c: any) => {
      const name = String(c?.mc_nome_colonna || '').trim().toLowerCase();
      return name !== 'asas' && name !== 'deleted';
    });
  }

  private getLookupAliasKey(col: any): string {
    const route = String(col?.mc_ui_lookup_entity_name || '').trim().replaceAll(' ', '_');
    const textField = String(col?.mc_ui_lookup_dataTextField || col?.mc_ui_grid_display_field || '').trim();
    const field = String(col?.mc_nome_colonna || '').trim();

    if (!route || !textField || !field) {
      return '';
    }

    return `${route}___${textField}__${field}`;
  }

  private resolveLookupText(col: any, record: any): string | null {
    if (!record || col?.mc_ui_column_type !== 'lookupByID') {
      return null;
    }

    const textField = String(col?.mc_ui_lookup_dataTextField || col?.mc_ui_grid_display_field || '').trim();

    const aliasKey = this.getLookupAliasKey(col);
    if (aliasKey && record[aliasKey] != null && String(record[aliasKey]) !== '') {
      return String(record[aliasKey]);
    }

    if (textField && record[textField] != null && String(record[textField]) !== '') {
      return String(record[textField]);
    }

    const lookupObj = record[`${col.mc_nome_colonna}__lookup_obj`];
    if (lookupObj && typeof lookupObj === 'object') {
      if (textField && lookupObj[textField] != null && String(lookupObj[textField]) !== '') {
        return String(lookupObj[textField]);
      }

      const fallbackObjText = lookupObj.description ?? lookupObj.descrizione ?? lookupObj.label ?? lookupObj.name ?? lookupObj.text;
      if (fallbackObjText != null && String(fallbackObjText) !== '') {
        return String(fallbackObjText);
      }
    }

    return null;
  }

  isLocalDateColumn(col: any): boolean {
    const name = String(col?.mc_nome_colonna || '').trim().toLowerCase();
    const label = String(col?.mc_display_string_in_view || '').trim().toLowerCase();

    return name === 'validfrom'
      || name === 'validto'
      || label === 'valid from'
      || label === 'valid to';
  }

  formatCellValue(col: any, value: any, record?: any): string {
    const lookupText = this.resolveLookupText(col, record);
    if (lookupText != null) {
      return lookupText;
    }

    if (!this.isLocalDateColumn(col)) {
      return value == null ? '' : String(value);
    }

    if (value == null || value === '') {
      return '';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }

    return parsed.toLocaleString('it-IT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  parseData(data: any) {
    return data;
  }
}
