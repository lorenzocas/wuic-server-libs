import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, TreeListComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tree-sample-page',
  imports: [CommonModule, DataSourceComponent, TreeListComponent],
  templateUrl: './tree-sample-page.component.html',
  styleUrls: ['./tree-sample-page.component.css']
})
export class TreeSamplePageComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(TreeListComponent) tree?: TreeListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const tree = this.tree;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[TreeSamplePage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[TreeSamplePage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[TreeSamplePage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[TreeSamplePage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[TreeSamplePage] afterSync$', x)));
    }

    if (tree) {
      this.subscriptions.add(tree.onTreeDataBound.subscribe((x) => console.debug('[TreeSamplePage] onTreeDataBound', x)));
      this.subscriptions.add(tree.onTreeNodeExpand.subscribe((x) => console.debug('[TreeSamplePage] onTreeNodeExpand', x)));
      this.subscriptions.add(tree.onTreeNodeExpanded.subscribe((x) => console.debug('[TreeSamplePage] onTreeNodeExpanded', x)));
      this.subscriptions.add(tree.onTreeNodeSelect.subscribe((x) => console.debug('[TreeSamplePage] onTreeNodeSelect', x)));
      this.subscriptions.add(tree.onTreeNodeUnselect.subscribe((x) => console.debug('[TreeSamplePage] onTreeNodeUnselect', x)));
      this.subscriptions.add(tree.onTreeNodeCollapse.subscribe((x) => console.debug('[TreeSamplePage] onTreeNodeCollapse', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}

