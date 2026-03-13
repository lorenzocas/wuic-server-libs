import { OnInit } from '@angular/core';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';
import { ActivatedRoute, Router } from '@angular/router';
import { ResultInfo } from '../../class/resultInfo';
import { BehaviorSubject } from 'rxjs';
import { UserInfoService } from '../../service/user-info.service';
import { Table } from 'primeng/table';
import * as i0 from "@angular/core";
export declare class BoundedRepeaterComponent implements OnInit {
    private route;
    private router;
    userService: UserInfoService;
    hardcodedRoute: string;
    routeName: BehaviorSubject<string>;
    action: BehaviorSubject<string>;
    parentRecord: any;
    parentMetaInfo: MetaInfo;
    rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
    datasource?: DataSourceComponent;
    loading: BehaviorSubject<boolean>;
    boundedInfo: {
        resultInfo: ResultInfo;
        metaInfo: MetaInfo;
    };
    private pendingListRefresh;
    constructor(route: ActivatedRoute, router: Router, userService: UserInfoService);
    ngOnInit(): void;
    onRepeaterTemplateReady(action: string): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<BoundedRepeaterComponent, never>;
    static ɵcmp: i0.ɵɵComponentDeclaration<BoundedRepeaterComponent, "wuic-bounded-repeater", never, { "hardcodedRoute": { "alias": "hardcodedRoute"; "required": false; }; "routeName": { "alias": "routeName"; "required": false; }; "action": { "alias": "action"; "required": false; }; "parentRecord": { "alias": "parentRecord"; "required": false; }; "parentMetaInfo": { "alias": "parentMetaInfo"; "required": false; }; "rowCustomSelect": { "alias": "rowCustomSelect"; "required": false; }; }, {}, never, never, true, never>;
}
//# sourceMappingURL=bounded-repeater.component.d.ts.map