import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, TreeListComponent } from 'wuic-framework-lib';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cities-tree-page',
  imports: [CommonModule, DataSourceComponent, TreeListComponent],
  templateUrl: './cities-tree-page.component.html',
  styleUrls: ['./cities-tree-page.component.css']
})
export class CitiesTreePageComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(TreeListComponent) tree?: TreeListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const tree = this.tree;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[CitiesTreePage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[CitiesTreePage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[CitiesTreePage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[CitiesTreePage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[CitiesTreePage] afterSync$', x)));
    }

    if (tree) {
      this.subscriptions.add(tree.onTreeDataBound.subscribe((x) => console.debug('[CitiesTreePage] onTreeDataBound', x)));
      this.subscriptions.add(tree.onTreeNodeExpand.subscribe((x) => console.debug('[CitiesTreePage] onTreeNodeExpand', x)));
      this.subscriptions.add(tree.onTreeNodeExpanded.subscribe((x) => console.debug('[CitiesTreePage] onTreeNodeExpanded', x)));
      this.subscriptions.add(tree.onTreeNodeSelect.subscribe((x) => console.debug('[CitiesTreePage] onTreeNodeSelect', x)));
      this.subscriptions.add(tree.onTreeNodeUnselect.subscribe((x) => console.debug('[CitiesTreePage] onTreeNodeUnselect', x)));
      this.subscriptions.add(tree.onTreeNodeCollapse.subscribe((x) => console.debug('[CitiesTreePage] onTreeNodeCollapse', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
