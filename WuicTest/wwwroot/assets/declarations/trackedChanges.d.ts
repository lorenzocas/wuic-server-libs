export declare class TrackedChange {
    pkey: string;
    guid: string;
    changes: ChangeT[];
    constructor(pkey: any, guid: any);
}
export declare class ChangeT {
    field: string;
    oldValue: any;
    newValue: any;
    timestamp?: Date;
    constructor(field: string, oldValue: any, newValue: any);
}
//# sourceMappingURL=trackedChanges.d.ts.map