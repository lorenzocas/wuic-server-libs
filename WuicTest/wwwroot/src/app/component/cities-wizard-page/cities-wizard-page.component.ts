import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, ParametricDialogComponent } from 'wuic-framework-lib';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cities-wizard-page',
  imports: [CommonModule, DataSourceComponent, ParametricDialogComponent],
  templateUrl: './cities-wizard-page.component.html',
  styleUrls: ['./cities-wizard-page.component.css']
})
export class CitiesWizardPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(ParametricDialogComponent) wizard?: ParametricDialogComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const wizard = this.wizard;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[CitiesWizardPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[CitiesWizardPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[CitiesWizardPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[CitiesWizardPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[CitiesWizardPage] afterSync$', x)));
    }

    if (wizard) {
      this.subscriptions.add(wizard.onDialogDataBound.subscribe((x) => console.debug('[CitiesWizardPage] onDialogDataBound', x)));
      this.subscriptions.add(wizard.onDialogTabChange.subscribe((x) => console.debug('[CitiesWizardPage] onDialogTabChange', x)));
      this.subscriptions.add(wizard.onWizardStepChange.subscribe((x) => console.debug('[CitiesWizardPage] onWizardStepChange', x)));
      this.subscriptions.add(wizard.onDialogCustomAction.subscribe((x) => console.debug('[CitiesWizardPage] onDialogCustomAction', x)));
      this.subscriptions.add(wizard.onDialogSubmit.subscribe((x) => console.debug('[CitiesWizardPage] onDialogSubmit', x)));
      this.subscriptions.add(wizard.onDialogRollback.subscribe((x) => console.debug('[CitiesWizardPage] onDialogRollback', x)));
      this.subscriptions.add(wizard.onDialogCloseRequested.subscribe((x) => console.debug('[CitiesWizardPage] onDialogCloseRequested', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
