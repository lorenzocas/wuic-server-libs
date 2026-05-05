export class TrackedChange {
    pkey: string;
    guid: string;
    changes: ChangeT[];

    constructor(pkey, guid) {
        this.pkey = pkey;
        this.guid = guid;

        this.changes = [];
    }
}

export class ChangeT {
    field: string;
    oldValue: any;
    newValue: any;
    timestamp?: Date;

    constructor(field: string, oldValue: any, newValue: any) {
        this.timestamp = new Date();
        this.field = field;
        this.oldValue = oldValue;
        this.newValue = newValue;
    }
}