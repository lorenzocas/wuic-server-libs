import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, TreeListComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

/**
 * Pattern 5 — Framework component + Framework data (manual mount) / esempio 5i.
 *
 * Monta `<wuic-tree-list>` + `<wuic-data-source>` su una route gerarchica.
 * Dimostra l'archetype tree (nav gerarchica via parentField/labelField/
 * iconField/leafField su `md_props_bag.archetypes.tree`).
 */
@Component({
  selector: 'app-5i-tree-sample',
  imports: [CommonModule, DataSourceComponent, TreeListComponent],
  templateUrl: './5i-tree-sample.component.html',
  styleUrls: ['./5i-tree-sample.component.css']
})
export class Pattern5iTreeSampleComponent implements AfterViewInit, OnDestroy {
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

