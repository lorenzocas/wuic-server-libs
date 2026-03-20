import { OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import * as i0 from "@angular/core";
export declare class TreeViewSelectorComponent implements OnInit {
    record: {
        [key: string]: BehaviorSubject<any>;
    };
    field: MetadatiColonna;
    metaInfo: any;
    isFilter?: boolean;
    nestedIndex: number;
    triggerProp: BehaviorSubject<any>;
    readOnly: boolean;
    nodes: any[];
    constructor();
    ngOnInit(): void;
    onNodeExpand($event: any): void;
    modelChangeFn(value: any): Promise<void>;
    static ɵfac: i0.ɵɵFactoryDeclaration<TreeViewSelectorComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<TreeViewSelectorComponent, "wuic-tree-view-selector", never, { "record": { "alias": "record"; "required": false; }; "field": { "alias": "field"; "required": false; }; "metaInfo": { "alias": "metaInfo"; "required": false; }; "isFilter": { "alias": "isFilter"; "required": false; }; "nestedIndex": { "alias": "nestedIndex"; "required": false; }; "triggerProp": { "alias": "triggerProp"; "required": false; }; "readOnly": { "alias": "readOnly"; "required": false; }; "nodes": { "alias": "nodes"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=tree-view-selector.component.d.ts.map