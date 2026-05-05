import { BehaviorSubject } from "rxjs";
import { IDesignerProperties } from "./IDesignerProperties";
import { MetadatiColonna } from "./metadati_colonna";
import { MetaInfo } from "./metaInfo";

export class TabOptions implements IDesignerProperties {
    public label: string;
    public icon: string;

    constructor() {

    }

    init(metaInfo: MetaInfo) {

    }

    archetypePropName: string = "tab";

    public getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo {
        let props = [];

        let label = new MetadatiColonna("label");
        label.mc_display_string_in_edit = "Label";
        label.mc_ui_column_type = "text";
        label.mc_ui_size_width = "100%";

        label.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            // WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propParentField.mc_nome_colonna}`, [null, propParentField], newValue ? newValue.mc_nome_colonna : undefined);
            // action.next(this.archetypePropName);
        };

        props.push(label);

        let mi = new MetaInfo();
        mi.columnMetadata = props;

        return mi;
    }
}