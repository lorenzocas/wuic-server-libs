import { BehaviorSubject } from "rxjs";
import { DataSourceComponent } from "../component/data-source/data-source.component";
import { MetadataProviderService } from "../service/metadata-provider.service";
import { FilterInfo } from "./filterInfo";
import { FilterItem } from "./filterItem";
import { IDesignerProperties } from "./IDesignerProperties";
import { MetadatiColonna } from "./metadati_colonna";
import { MetaInfo } from "./metaInfo";
import { WtoolboxService } from "../service/wtoolbox.service";

export class TreeOptions implements IDesignerProperties {
    public parentField: string;
    public labelField: string;
    public iconField: string;
    public leafField: string;
    public labelFunction: string;
    public itemTemplateString: string;

    constructor() {

    }
    init(metaInfo: MetaInfo) {
        const tree: any = metaInfo?.tableMetadata?.extraProps?.archetypes?.tree || {};

        this.parentField = tree.parentField ?? this.parentField;
        this.labelField = tree.labelField ?? this.labelField;
        this.iconField = tree.iconField ?? this.iconField;
        this.leafField = tree.leafField ?? this.leafField;
        this.labelFunction = tree.labelFunction ?? this.labelFunction;
        this.itemTemplateString = tree.itemTemplateString ?? this.itemTemplateString;
    }

    archetypePropName: string = "tree";

    public getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo {
        let props = [];

        let propParentField = new MetadatiColonna("parentField");
        propParentField.mc_display_string_in_edit = "Parent Field Name";
        propParentField.mc_ui_column_type = "lookupByID";
        propParentField.mc_ui_lookup_entity_name = MetadataProviderService.metaColumnRoute;
        propParentField.mc_ui_lookup_dataTextField = "mc_display_string_in_edit";
        propParentField.mc_ui_lookup_dataValueField = "mc_nome_colonna";
        propParentField.mc_ui_size_width = "100%";

        propParentField.extras.lookup = {
            filter: new FilterInfo("AND", [
                new FilterItem({ field: "md_id", operator: "eq", value: metaInfo.tableMetadata.md_id.toString(), fixed: true })
            ])
        };

        propParentField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propParentField.mc_nome_colonna}`, [null, propParentField], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propParentField);

        let propLabelField = MetadatiColonna.clone(propParentField);
        propLabelField.mc_nome_colonna = "labelField";
        propLabelField.mc_display_string_in_edit = "Node label Field Name";

        propLabelField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propLabelField.mc_nome_colonna}`, [null, propLabelField], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propLabelField);

        let propIconField = MetadatiColonna.clone(propLabelField);
        propIconField.mc_nome_colonna = "iconField";
        propIconField.mc_display_string_in_edit = "Node icon Field Name";

        propIconField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propIconField.mc_nome_colonna}`, [null, propIconField], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propIconField);

        let propLeafField = MetadatiColonna.clone(propIconField);
        propLeafField.mc_nome_colonna = "leafField";
        propLeafField.mc_display_string_in_edit = "'Is Leaf' Field Name";

        propLeafField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propLeafField.mc_nome_colonna}`, [null, propLeafField], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propLeafField);

        let propLabelFunction = new MetadatiColonna("labelFunction");
        propLabelFunction.mc_display_string_in_edit = "Node label Function";
        propLabelFunction.mc_ui_column_type = "txt_area";
        propLabelFunction.mc_ui_size_width = "100%";

        propLabelFunction.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propLabelFunction.mc_nome_colonna}`, [null, propLabelFunction], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propLabelFunction);

        let propItemTemplateString = new MetadatiColonna("itemTemplateString");
        propItemTemplateString.mc_display_string_in_edit = "Node template";
        propItemTemplateString.mc_ui_column_type = "txt_area";
        propItemTemplateString.mc_ui_size_width = "100%";

        propItemTemplateString.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propItemTemplateString.mc_nome_colonna}`, [null, propItemTemplateString], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propItemTemplateString);

        let mi = new MetaInfo();
        mi.columnMetadata = props;

        return mi;
    }
}
