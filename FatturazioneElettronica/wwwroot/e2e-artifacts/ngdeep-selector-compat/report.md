# ng-deep Selector Compatibility Report

- strictMode: false
- strictPolicies: required
- baseUrl: http://localhost:4200
- styleRoot: C:\src\Wuic\WuicTest\wwwroot\lib-src
- profileConfigPath: C:\src\Wuic\WuicTest\wwwroot\e2e\ngdeep-selector-profiles.json
- docsPlaywrightRoot: C:\src\Wuic\KonvergenceCore\wwwroot\my-workspace\playwright\docs
- showcaseRoutes: 72
- uniqueSelectors: 396
- invalidSelectors: 0
- missingSelectors: 268
- requiredMissingSelectors: 137
- statefulMissingSelectors: 131
- optionalMissingSelectors: 0
- missingInLiveRoutes: 303
- requiredMissingInLiveRoutes: 171
- statefulMissingInLiveRoutes: 132
- optionalMissingInLiveRoutes: 0

## Required Missing
- `.carousel-content .carousel-item-caption`
  sources: lib-src/component/carousel-list/carousel-list.component.css
- `.data-repeater-body > ng-component`
  sources: lib-src/component/data-repeater/data-repeater.component.css
- `.data-repeater-body > ng-component > *`
  sources: lib-src/component/data-repeater/data-repeater.component.css
- `.wuic-data-repeater-fill-height .data-repeater-body > ng-component > *`
  sources: lib-src/component/data-repeater/data-repeater.component.css
- `.wuic-data-repeater-fill-height wuic-map-list .map-list-root`
  sources: lib-src/component/data-repeater/data-repeater.component.css
- `.wuic-data-repeater-fill-height wuic-map-list .map-list-root google-map`
  sources: lib-src/component/data-repeater/data-repeater.component.css
- `.designer-left-bottom-splitter .p-splitterpanel > .p-splitterpanel-content`
  sources: lib-src/component/designer/designer.component.css
- `.hierarchy-tree-wrap .p-tree-node-content`
  sources: lib-src/component/designer/designer.component.css
- `.hierarchy-tree-wrap .p-tree-node-content.p-highlight`
  sources: lib-src/component/designer/designer.component.css
- `.hierarchy-tree-wrap .hierarchy-node-label`
  sources: lib-src/component/designer/designer.component.css
- `.hierarchy-tree-wrap .hierarchy-node-label.active`
  sources: lib-src/component/designer/designer.component.css
- `.hierarchy-tree-wrap .p-tree-node-content.p-highlight .hierarchy-node-label`
  sources: lib-src/component/designer/designer.component.css
- `.dashboard-design.designer-hide-datasources .datasource-descriptor`
  sources: lib-src/component/designer/designer.component.css
- `.designer-footer-hover-target`
  sources: lib-src/component/designer/designer.component.css
- `.wuic-filter-bar .p-tabpanels`
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.wuic-filter-bar .p-tabpanel`
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.wuic-filter-bar [data-pc-name="tabpanel"]`
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.wuic-filter-bar .row`
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.wuic-filter-bar .filter-buttons`
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.advanced-rule-value wuic-field-filter`
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.advanced-rule-value wuic-field-filter[class*='col-md-']`
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.advanced-rule-value .data-field-wrapper`
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.advanced-rule-value .data-field-field`
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.advanced-rule-value .editor-wapper`
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.section-html ol`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ol > li`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ol > li:nth-child(odd)`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ol > li:nth-child(even)`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-json code .tok-string`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-ts code .tok-comment`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-cs code .tok-string`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-cs code .tok-number`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.screenshots .p-image .p-image-mask`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-mask`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-toolbar`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-action`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-preview-container .p-image-preview-close`
  sources: lib-src/component/framework-docs/framework-docs.component.scss, lib-src/component/image-wrapper/image-wrapper.component.css
- `.p-image-mask.p-component-overlay`
  sources: lib-src/component/framework-docs/framework-docs.component.scss, lib-src/component/image-wrapper/image-wrapper.component.css
- `.p-image-preview-mask.p-component-overlay`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-preview-container`
  sources: lib-src/component/framework-docs/framework-docs.component.scss, lib-src/component/image-wrapper/image-wrapper.component.css
- `.p-image-preview-container .p-image-toolbar`
  sources: lib-src/component/framework-docs/framework-docs.component.scss, lib-src/component/image-wrapper/image-wrapper.component.css
- `.p-image-preview-container .p-image-action`
  sources: lib-src/component/framework-docs/framework-docs.component.scss, lib-src/component/image-wrapper/image-wrapper.component.css
- `.screenshots .p-image .p-image-preview-indicator`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.wuic-progress-dialog .p-progressbar`
  sources: lib-src/component/import-export-button/import-export-button.component.scss, lib-src/component/list-grid/list-grid.component.scss
- `.wuic-progress-dialog .p-progressbar .p-progressbar-value`
  sources: lib-src/component/import-export-button/import-export-button.component.scss, lib-src/component/list-grid/list-grid.component.scss
- `.wuic-progress-dialog .p-progressbar-value`
  sources: lib-src/component/import-export-button/import-export-button.component.scss, lib-src/component/list-grid/list-grid.component.scss
- `.wuic-export-progress-dialog .p-progressbar .p-progressbar-value`
  sources: lib-src/component/import-export-button/import-export-button.component.scss, lib-src/component/list-grid/list-grid.component.scss
- `.wuic-export-progress-dialog .p-progressbar-value`
  sources: lib-src/component/import-export-button/import-export-button.component.scss, lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-wrapper`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-scrollable`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-scrollable-view`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-scrollable-body`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `table.wuic-nested-grid > thead.p-datatable-thead`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `table.wuic-nested-grid > thead.p-datatable-thead > tr > th`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-tbody > tr.wuic-row-selected > td`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-tbody > tr.wuic-row-selected > td:first-child`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-frozen-view`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-frozen-view .p-datatable-table-container`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-frozen-view .p-datatable-scrollable-body`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-scrollable-table > .p-datatable-tfoot > tr:first-child > th`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-scrollable-table > .p-datatable-tfoot > tr > th:first-child`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-tbody > tr > td > a`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-splitbutton .p-button`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-inputtext`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar p-splitbutton`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-splitbutton`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-splitbutton .p-splitbutton-defaultbutton`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-splitbutton .p-splitbutton-menubutton`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-splitbutton .p-splitbutton-menubutton .p-button-icon`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td wuic-field-editor-lazy`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td wuic-field-editor`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .data-field-wrapper`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .data-field-field`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .editor-wapper`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .editor-wapper > div`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .caption-wrapper`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .caption-wrapper`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-inputtext`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-datepicker`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-datepicker .p-inputtext`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-autocomplete`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-autocomplete .p-inputtext`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-select`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-multiselect`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-datepicker .p-datepicker-input`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-datepicker .p-datepicker-dropdown`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-disabled .p-inputtext`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .disabled-textfield`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td wuic-field-editor-lazy`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td wuic-field-editor`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .caption-wrapper`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .data-field-wrapper`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .data-field-field`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .editor-wapper`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .editor-wapper > div`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .disabled-textfield`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.gm-style .gm-style-iw-c`
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .gm-style-iw-d`
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .gm-ui-hover-effect`
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .map-info`
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .map-info-title`
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .gm-ui-hover-effect > span`
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .p-tieredmenu`
  sources: lib-src/component/map-list/map-list.component.css
- `.notification-item-progress .p-progressbar .p-progressbar-value`
  sources: lib-src/component/notification-bell/notification-bell.component.css
- `.notification-item-progress .p-progressbar-value`
  sources: lib-src/component/notification-bell/notification-bell.component.css
- `.pivot-chip-agg-select`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-table`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-table .p-datatable-wrapper`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-table td`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-table th`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-splitter`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-buckets-splitter > .p-splitter-panel`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-splitter > .p-splitter-panel`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-buckets-splitter > .p-splitter-panel > .pivot-panel`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.p-accordionpanel-content`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-filter-full .p-accordion`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-filter-full .p-accordionpanel`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-filter-full .p-accordioncontent`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-filter-full .p-accordionpanel-content`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-filter-full .p-accordioncontent-content`
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.fc .fc-v-event`
  sources: lib-src/component/scheduler-list/scheduler-list.component.css
- `.fc .fc-timegrid-event`
  sources: lib-src/component/scheduler-list/scheduler-list.component.css
- `.wuic-spreadsheet-host .jspreadsheet`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jexcel`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jexcel_content`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss > thead > tr > th.selected`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jdropdown-container`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jexcel_pagination`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jpagination`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .wuic-server-page-spacer`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.tree-list-root .p-tree`
  sources: lib-src/component/tree-list/tree-list.component.css
- `.tree-list-root .p-tree-wrapper`
  sources: lib-src/component/tree-list/tree-list.component.css
- `.workflow-canvas [data-wf-node-type] .node`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.workflow-canvas [data-wf-node-type] .title`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.workflow-canvas [data-wf-node-type="action"][data-wf-action-scope="col"] .node`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.workflow-canvas [data-wf-node-type="action"][data-wf-action-scope="tab"] .node`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css

## Stateful Missing
- `.carousel-content .p-carousel-item .carousel-item-card:hover`
  sources: lib-src/component/carousel-list/carousel-list.component.css
- `[data-theme='dark'] .carousel-content .carousel-item-caption`
  sources: lib-src/component/carousel-list/carousel-list.component.css
- `.html-preview-pane__body .wuic-preview-component`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.html-preview-pane__body .wuic-preview-component__title`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.html-preview-pane__body .wuic-preview-component__content`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.html-preview-pane__body .wuic-preview-field__label`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.html-preview-pane__body .wuic-preview-field__input`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.monaco-editor .suggest-widget`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.monaco-editor .parameter-hints-widget`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.monaco-editor .monaco-hover`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.monaco-editor .suggest-widget .tree`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.monaco-editor .suggest-widget .monaco-list`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.monaco-editor .suggest-widget .monaco-list-rows`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.monaco-editor .suggest-widget .monaco-scrollable-element`
  sources: lib-src/component/code-editor/code-editor.component.scss
- `.hierarchy-tree-wrap .p-tree-node-content:hover`
  sources: lib-src/component/designer/designer.component.css
- `.hierarchy-tree-wrap .hierarchy-node-label:hover`
  sources: lib-src/component/designer/designer.component.css
- `.color-editor-root .p-colorpicker-preview`
  sources: lib-src/component/field/color-editor/color-editor.component.scss
- `.wuic-dictionary-panel.p-select-overlay`
  sources: lib-src/component/field/dictionary-editor/dictionary-editor.component.scss
- `.wuic-dictionary-panel.p-select-overlay .p-select-list-container`
  sources: lib-src/component/field/dictionary-editor/dictionary-editor.component.scss
- `.wuic-range-filter-item .p-inputnumber`
  sources: lib-src/component/field/field-filter/field-filter.component.scss
- `.wuic-range-filter-item .p-inputnumber-input`
  sources: lib-src/component/field/field-filter/field-filter.component.scss
- `.wuic-filter-bar .row::after`
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.section-html ul > li::before`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ol > li::before`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html li > :where(ul, ol)`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-preview-container .p-image-preview-close:hover`
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-mask.p-overlay-mask`
  sources: lib-src/component/image-wrapper/image-wrapper.component.css
- `.p-datatable-table-container:has( > table.wuic-nested-grid)`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.p-datatable:has( > .p-datatable-table-container > table.wuic-nested-grid)`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container:has(table.wuic-nested-grid)`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `wuic-list-grid:has(table.wuic-nested-grid)`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `wuic-list-grid-lazy:has(table.wuic-nested-grid)`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.data-repeater-body:has(table.wuic-nested-grid)`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `td:has(wuic-data-repeater table.wuic-nested-grid)`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-tbody > tr:not(.p-highlight):hover > td`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-tbody > tr.wuic-row-selected:hover > td`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-inputtext:disabled`
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.gm-style .gm-style-iw-tc::after`
  sources: lib-src/component/map-list/map-list.component.css
- `.theme-dark .gm-style .dropdown-content`
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .p-tieredmenu .p-menuitem-content:hover`
  sources: lib-src/component/map-list/map-list.component.css
- `.theme-dark .gm-style .dropdown-content .p-menuitem-content:hover`
  sources: lib-src/component/map-list/map-list.component.css
- `.p-menubar .p-menubar-item-link[draggable="true"]:active`
  sources: lib-src/component/meta-menu/meta-menu.component.css
- `.p-menubar.p-menubar-mobile-active .p-menubar-root-list`
  sources: lib-src/component/meta-menu/meta-menu.component.css
- `.p-menubar.p-menubar-mobile-active .p-menubar-submenu`
  sources: lib-src/component/meta-menu/meta-menu.component.css
- `.p-menubar.p-menubar-mobile-active .p-menubar-submenu > .p-menubar-item`
  sources: lib-src/component/meta-menu/meta-menu.component.css
- `.p-menubar.p-menubar-mobile-active .p-menubar-item-link`
  sources: lib-src/component/meta-menu/meta-menu.component.css
- `.p-menubar.p-menubar-mobile-active .p-menubar-root-list > .p-menubar-item > .p-menubar-submenu`
  sources: lib-src/component/meta-menu/meta-menu.component.css
- `.p-menubar.p-menubar-mobile-active .p-menubar-root-list > .p-menubar-item > .p-menubar-submenu > .p-menubar-item > .p-menubar-item-link`
  sources: lib-src/component/meta-menu/meta-menu.component.css
- `.p-contextmenu`
  sources: lib-src/component/meta-menu/meta-menu.component.css
- `.p-menubar-item-link[draggable="true"]:active`
  sources: lib-src/component/meta-menu/meta-menu.component.css
- `.metadata-editor .p-menubar-item`
  sources: lib-src/component/metadata-editor/metadata-editor.component.css
- `.metadata-editor li`
  sources: lib-src/component/metadata-editor/metadata-editor.component.css
- `.metadata-editor .p-menubar-submenu`
  sources: lib-src/component/metadata-editor/metadata-editor.component.css
- `body .p-menubar.metadata-editor .p-menubar-submenu`
  sources: lib-src/component/metadata-editor/metadata-editor.component.css
- `.metadata-editor .p-menubar-root-list > .p-menubar-item > .p-menubar-submenu.wuic-open-upward`
  sources: lib-src/component/metadata-editor/metadata-editor.component.css
- `body .p-menubar.metadata-editor .p-menubar-root-list > .p-menubar-item > .p-menubar-submenu.wuic-open-upward`
  sources: lib-src/component/metadata-editor/metadata-editor.component.css
- `body .p-menubar.metadata-editor .p-menubar-submenu li[id^="related-meta-insert-separator-"].p-menubar-separator`
  sources: lib-src/component/metadata-editor/metadata-editor.component.css
- `body .p-menubar.metadata-editor .p-menubar-submenu li[id^="related-meta-section-separator-"].p-menubar-separator`
  sources: lib-src/component/metadata-editor/metadata-editor.component.css
- `body .p-menubar.metadata-editor .p-menubar-submenu li[id^="related-meta-section-"] .p-menubar-item-content`
  sources: lib-src/component/metadata-editor/metadata-editor.component.css
- `body .p-menubar.metadata-editor .p-menubar-submenu li[id^="related-meta-section-"] .p-menubar-item-link`
  sources: lib-src/component/metadata-editor/metadata-editor.component.css
- `body .p-menubar.metadata-editor .p-menubar-submenu li[id^="related-meta-section-"] .p-menubar-item-label`
  sources: lib-src/component/metadata-editor/metadata-editor.component.css
- `.parametric-toolbar-btn.p-button:hover`
  sources: lib-src/component/parametric-dialog/parametric-dialog.component.scss
- `stimulsoft-designer-angular`
  sources: lib-src/component/report-designer/report-designer.component.css
- `.stiDesignerMainPanel`
  sources: lib-src/component/report-designer/report-designer.component.css
- `.stiDesignerMainPanel *`
  sources: lib-src/component/report-designer/report-designer.component.css
- `stimulsoft-viewer-angular`
  sources: lib-src/component/report-viewer/report-viewer.component.css
- `.stiJsViewerForm`
  sources: lib-src/component/report-viewer/report-viewer.component.css
- `.stiJsViewerDisabledPanel`
  sources: lib-src/component/report-viewer/report-viewer.component.css
- `.wuic-spreadsheet-host .jss_container`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_highlight`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_contextmenu > div:hover`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_contextmenu > div.wuic-jss-contextmenu-item-hover`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_filters_options .lm-lazy-items > div:hover`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.jss_contextmenu > div.wuic-jss-contextmenu-item-hover`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.jss_contextmenu > div.wuic-jss-contextmenu-item-hover > *`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.jss_contextmenu > div.wuic-jss-contextmenu-item-hover:hover`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_style_form_group input[type="text"]`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_style_form_group input[type="number"]`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_style_form_group select`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_style_form_group textarea`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host th.jss_filters_icon::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host div.jss_filters_icon::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host div.jss_filters_icon.jss_filters_active::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host div.jss_filters_icon:hover::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host th.jss_filters_icon:hover::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_header > i.material-icons`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_row > i.material-icons`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_header:hover > i.material-icons`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_row:hover > i.material-icons`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_header.jss_filters_icon > i.material-icons`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar i.jss_toolbar_item`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jpicker-header`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jtoolbar-item:hover`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jtoolbar-item > .jpicker-header:hover`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jss_toolbar_selected`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host div.jss_filters_icon`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host div.jss_filters_icon:hover`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host div.jss_filters_icon.jss_filters_active`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host div.jss_filters_icon.jss_filters_active:hover`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host .jspreadsheet`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host .jss_highlight`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host .jdropdown-container`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host .jss_filters_options .lm-lazy-items > div:hover`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host .jss_style_form_group input[type="number"]`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host .jss_style_form_group select`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host .jss_style_form_group textarea`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host div.jss_filters_icon.jss_filters_active::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host th.jss_filters_icon:hover::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host .jss_header:hover > i.material-icons`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host .jss_row:hover > i.material-icons`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host .jss_header.jss_filters_icon > i.material-icons`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.theme-dark .wuic-spreadsheet-host div.jss_filters_icon:hover`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jtoolbar-item .pi::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jtoolbar-item .pi.p-button-icon::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jtoolbar-item:hover .pi::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jtoolbar-item:hover .pi.p-button-icon::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jtoolbar-item:hover i.material-icons`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jtoolbar-item > .jpicker-header:hover .pi::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jtoolbar-item > .jpicker-header:hover i.material-icons`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jss_toolbar_selected .pi::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jss_toolbar_selected .pi.p-button-icon::before`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss_toolbar .jss_toolbar_selected i.material-icons`
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.workflow-route-metadata-dialog.p-dialog`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.workflow-route-metadata-dialog .p-dialog-content`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.p-menu`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.theme-dark .p-contextmenu`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.p-menu .p-menu-item-content`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.theme-dark .p-contextmenu .p-menu-item-content`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.p-menu .p-menu-item-content:hover`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.theme-dark .p-contextmenu .p-menu-item-content:hover`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.theme-dark .p-dialog .p-dialog-footer`
  sources: lib-src/component/workflow-designer/workflow-designer.component.css

## Optional Missing

## Required Missing In Live Routes
- `.carousel-content .carousel-item-caption` (docsHits=0)
  sources: lib-src/component/carousel-list/carousel-list.component.css
- `.data-repeater-body > ng-component` (docsHits=0)
  sources: lib-src/component/data-repeater/data-repeater.component.css
- `.data-repeater-body > ng-component > *` (docsHits=0)
  sources: lib-src/component/data-repeater/data-repeater.component.css
- `.wuic-data-repeater-fill-height .data-repeater-body > ng-component > *` (docsHits=0)
  sources: lib-src/component/data-repeater/data-repeater.component.css
- `.wuic-data-repeater-fill-height wuic-map-list .map-list-root` (docsHits=0)
  sources: lib-src/component/data-repeater/data-repeater.component.css
- `.wuic-data-repeater-fill-height wuic-map-list .map-list-root google-map` (docsHits=0)
  sources: lib-src/component/data-repeater/data-repeater.component.css
- `.designer-left-bottom-splitter .p-splitterpanel > .p-splitterpanel-content` (docsHits=0)
  sources: lib-src/component/designer/designer.component.css
- `.hierarchy-tree-wrap .p-tree-node-content` (docsHits=0)
  sources: lib-src/component/designer/designer.component.css
- `.hierarchy-tree-wrap .p-tree-node-content.p-highlight` (docsHits=0)
  sources: lib-src/component/designer/designer.component.css
- `.hierarchy-tree-wrap .hierarchy-node-label` (docsHits=0)
  sources: lib-src/component/designer/designer.component.css
- `.hierarchy-tree-wrap .hierarchy-node-label.active` (docsHits=0)
  sources: lib-src/component/designer/designer.component.css
- `.hierarchy-tree-wrap .p-tree-node-content.p-highlight .hierarchy-node-label` (docsHits=0)
  sources: lib-src/component/designer/designer.component.css
- `.dashboard-design.designer-hide-datasources .datasource-descriptor` (docsHits=0)
  sources: lib-src/component/designer/designer.component.css
- `.designer-footer-hover-target` (docsHits=0)
  sources: lib-src/component/designer/designer.component.css
- `.wuic-filter-bar .p-tabpanels` (docsHits=0)
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.wuic-filter-bar .p-tabpanel` (docsHits=0)
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.wuic-filter-bar [data-pc-name="tabpanel"]` (docsHits=0)
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.wuic-filter-bar .row` (docsHits=0)
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.wuic-filter-bar .filter-buttons` (docsHits=0)
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.advanced-rule-value wuic-field-filter` (docsHits=0)
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.advanced-rule-value wuic-field-filter[class*='col-md-']` (docsHits=0)
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.advanced-rule-value .data-field-wrapper` (docsHits=0)
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.advanced-rule-value .data-field-field` (docsHits=0)
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.advanced-rule-value .editor-wapper` (docsHits=0)
  sources: lib-src/component/filter-bar/filter-bar.component.css
- `.section-html p` (docsHits=56)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ul` (docsHits=54)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ul > li` (docsHits=54)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ul > li:nth-child(odd)` (docsHits=54)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ul > li:nth-child(even)` (docsHits=54)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ol` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ol > li` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ol > li:nth-child(odd)` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.section-html ol > li:nth-child(even)` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block code .tok-comment` (docsHits=1)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block code .tok-string` (docsHits=6)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block code .tok-number` (docsHits=15)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block code .tok-keyword` (docsHits=27)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block code .tok-type` (docsHits=12)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block code .tok-fn` (docsHits=15)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block code .tok-prop` (docsHits=15)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block code .tok-op` (docsHits=31)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-html code .tok-tag` (docsHits=9)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-html code .tok-attr` (docsHits=2)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-html code .tok-string` (docsHits=2)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-json code .tok-key` (docsHits=25)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-json code .tok-string` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-json code .tok-keyword` (docsHits=19)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-json code .tok-number` (docsHits=13)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-ts code .tok-keyword` (docsHits=15)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-ts code .tok-type` (docsHits=12)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-ts code .tok-fn` (docsHits=14)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-ts code .tok-prop` (docsHits=14)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-ts code .tok-string` (docsHits=5)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-ts code .tok-comment` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-ts code .tok-number` (docsHits=2)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-cs code .tok-keyword` (docsHits=1)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-cs code .tok-fn` (docsHits=1)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-cs code .tok-prop` (docsHits=1)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-cs code .tok-string` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-cs code .tok-comment` (docsHits=1)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.code-block.lang-cs code .tok-number` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.screenshots .p-image` (docsHits=36)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.screenshots .p-image img` (docsHits=36)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.screenshots .p-image .p-image-preview-mask` (docsHits=36)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.screenshots .p-image .p-image-mask` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-mask` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-preview-mask` (docsHits=36)
  sources: lib-src/component/framework-docs/framework-docs.component.scss, lib-src/component/image-wrapper/image-wrapper.component.css
- `.p-image-toolbar` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-action` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-preview` (docsHits=36)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-preview-container .p-image-preview-close` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss, lib-src/component/image-wrapper/image-wrapper.component.css
- `.p-image-mask.p-component-overlay` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss, lib-src/component/image-wrapper/image-wrapper.component.css
- `.p-image-preview-mask.p-component-overlay` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.p-image-preview-container` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss, lib-src/component/image-wrapper/image-wrapper.component.css
- `.p-image-preview-container .p-image-toolbar` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss, lib-src/component/image-wrapper/image-wrapper.component.css
- `.p-image-preview-container .p-image-action` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss, lib-src/component/image-wrapper/image-wrapper.component.css
- `.screenshots .p-image .p-image-preview-indicator` (docsHits=0)
  sources: lib-src/component/framework-docs/framework-docs.component.scss
- `.wuic-progress-dialog .p-progressbar` (docsHits=0)
  sources: lib-src/component/import-export-button/import-export-button.component.scss, lib-src/component/list-grid/list-grid.component.scss
- `.wuic-progress-dialog .p-progressbar .p-progressbar-value` (docsHits=0)
  sources: lib-src/component/import-export-button/import-export-button.component.scss, lib-src/component/list-grid/list-grid.component.scss
- `.wuic-progress-dialog .p-progressbar-value` (docsHits=0)
  sources: lib-src/component/import-export-button/import-export-button.component.scss, lib-src/component/list-grid/list-grid.component.scss
- `.wuic-export-progress-dialog .p-progressbar .p-progressbar-value` (docsHits=0)
  sources: lib-src/component/import-export-button/import-export-button.component.scss, lib-src/component/list-grid/list-grid.component.scss
- `.wuic-export-progress-dialog .p-progressbar-value` (docsHits=0)
  sources: lib-src/component/import-export-button/import-export-button.component.scss, lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-wrapper` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-scrollable` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-scrollable-view` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-scrollable-body` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `table.wuic-nested-grid > thead.p-datatable-thead` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `table.wuic-nested-grid > thead.p-datatable-thead > tr > th` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-tbody > tr.wuic-row-selected > td` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-tbody > tr.wuic-row-selected > td:first-child` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-frozen-view` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-frozen-view .p-datatable-table-container` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-frozen-view .p-datatable-scrollable-body` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-scrollable-table > .p-datatable-tfoot > tr:first-child > th` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-scrollable-table > .p-datatable-tfoot > tr > th:first-child` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .p-datatable .p-datatable-tbody > tr > td > a` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-splitbutton .p-button` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-inputtext` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar p-splitbutton` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-splitbutton` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-splitbutton .p-splitbutton-defaultbutton` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-splitbutton .p-splitbutton-menubutton` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.grid-caption-bar .p-splitbutton .p-splitbutton-menubutton .p-button-icon` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td wuic-field-editor-lazy` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td wuic-field-editor` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .data-field-wrapper` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .data-field-field` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .editor-wapper` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .editor-wapper > div` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .caption-wrapper` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .caption-wrapper` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-inputtext` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-datepicker` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-datepicker .p-inputtext` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-autocomplete` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-autocomplete .p-inputtext` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-select` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-multiselect` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-datepicker .p-datepicker-input` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-datepicker .p-datepicker-dropdown` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .p-disabled .p-inputtext` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-cell-editing .p-datatable-tbody > tr > td .disabled-textfield` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td wuic-field-editor-lazy` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td wuic-field-editor` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .caption-wrapper` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .data-field-wrapper` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .data-field-field` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .editor-wapper` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .editor-wapper > div` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.list-grid-container .wuic-inline-editing:not(.wuic-inline-cell-editing) .p-datatable-tbody > tr > td .disabled-textfield` (docsHits=0)
  sources: lib-src/component/list-grid/list-grid.component.scss
- `.gm-style .gm-style-iw-c` (docsHits=0)
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .gm-style-iw-d` (docsHits=0)
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .gm-ui-hover-effect` (docsHits=0)
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .map-info` (docsHits=0)
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .map-info-title` (docsHits=0)
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .gm-ui-hover-effect > span` (docsHits=0)
  sources: lib-src/component/map-list/map-list.component.css
- `.gm-style .p-tieredmenu` (docsHits=0)
  sources: lib-src/component/map-list/map-list.component.css
- `.notification-item-progress .p-progressbar .p-progressbar-value` (docsHits=0)
  sources: lib-src/component/notification-bell/notification-bell.component.css
- `.notification-item-progress .p-progressbar-value` (docsHits=0)
  sources: lib-src/component/notification-bell/notification-bell.component.css
- `.pivot-chip-agg-select` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-table` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-table .p-datatable-wrapper` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-table td` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-table th` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-splitter` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-buckets-splitter > .p-splitter-panel` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-result-splitter > .p-splitter-panel` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-buckets-splitter > .p-splitter-panel > .pivot-panel` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.p-accordionpanel-content` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-filter-full .p-accordion` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-filter-full .p-accordionpanel` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-filter-full .p-accordioncontent` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-filter-full .p-accordionpanel-content` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.pivot-filter-full .p-accordioncontent-content` (docsHits=0)
  sources: lib-src/component/pivot-builder/pivot-builder.component.css
- `.fc .fc-v-event` (docsHits=0)
  sources: lib-src/component/scheduler-list/scheduler-list.component.css
- `.fc .fc-timegrid-event` (docsHits=0)
  sources: lib-src/component/scheduler-list/scheduler-list.component.css
- `.wuic-spreadsheet-host .jspreadsheet` (docsHits=0)
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jexcel` (docsHits=0)
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jexcel_content` (docsHits=0)
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jss > thead > tr > th.selected` (docsHits=0)
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jdropdown-container` (docsHits=0)
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jexcel_pagination` (docsHits=0)
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .jpagination` (docsHits=0)
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.wuic-spreadsheet-host .wuic-server-page-spacer` (docsHits=0)
  sources: lib-src/component/spreadsheet-list/spreadsheet-list.component.css
- `.tree-list-root .p-tree` (docsHits=0)
  sources: lib-src/component/tree-list/tree-list.component.css
- `.tree-list-root .p-tree-wrapper` (docsHits=0)
  sources: lib-src/component/tree-list/tree-list.component.css
- `.workflow-canvas [data-wf-node-type] .node` (docsHits=0)
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.workflow-canvas [data-wf-node-type] .title` (docsHits=0)
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.workflow-canvas [data-wf-node-type="action"][data-wf-action-scope="col"] .node` (docsHits=0)
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
- `.workflow-canvas [data-wf-node-type="action"][data-wf-action-scope="tab"] .node` (docsHits=0)
  sources: lib-src/component/workflow-designer/workflow-designer.component.css
