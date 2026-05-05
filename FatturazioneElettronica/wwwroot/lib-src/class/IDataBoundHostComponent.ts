import { BehaviorSubject } from 'rxjs';
import { DataSourceComponent } from '../component/data-source/data-source.component';

/**
 * Contract base per componenti host databound che lavorano con wuic datasource.
 * Pensata per componenti custom lato progetto host.
 */
export interface IDataBoundHostComponent {
  hardcodedRoute?: string;
  datasource: BehaviorSubject<DataSourceComponent>;
  hardcodedDatasource: DataSourceComponent | null;

  subscribeToDS(): void | Promise<void>;

  onDatasourceReady?(datasource: DataSourceComponent): void | Promise<void>;
  onFetchInfo?(info: any): void | Promise<void>;
  onAfterFirstLoad?(): void | Promise<void>;
}
