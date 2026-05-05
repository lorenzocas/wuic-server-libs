import { IDesignerProperties } from "./IDesignerProperties";
import { MetadatiColonna } from "./metadati_colonna";
import { FilterInfo } from "./filterInfo";
import { FilterItem } from "./filterItem";
import { MetaInfo } from "./metaInfo";
import { BehaviorSubject } from "rxjs";
import { WtoolboxService } from "../service/wtoolbox.service";

const META_COLUMN_ROUTE = " metadati  colonne";

export class SchedulerOptions implements IDesignerProperties {
    public fromField: string;
    public toField: string;
    public titleField: string;
    public itemTemplateString: string;
    public titleFunction: string;

    constructor() {

    }
    init(metaInfo: MetaInfo) {
        const scheduler: any = metaInfo?.tableMetadata?.extraProps?.archetypes?.scheduler || {};

        this.fromField = scheduler.fromField ?? this.fromField;
        this.toField = scheduler.toField ?? this.toField;
        this.titleField = scheduler.titleField ?? this.titleField;
        this.itemTemplateString = scheduler.itemTemplateString ?? this.itemTemplateString;
        this.titleFunction = scheduler.titleFunction ?? this.titleFunction;
    }

    archetypePropName: string = "scheduler";

    getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo {
        let props = [];

        let propFromField = new MetadatiColonna("fromField");
        propFromField.mc_display_string_in_edit = "FROM date field Name";
        propFromField.mc_ui_column_type = "lookupByID";
        propFromField.mc_ui_lookup_entity_name = META_COLUMN_ROUTE;
        propFromField.mc_ui_lookup_dataTextField = "mc_display_string_in_edit";
        propFromField.mc_ui_lookup_dataValueField = "mc_nome_colonna";
        propFromField.mc_ui_size_width = "100%";

        propFromField.extras.lookup = {
            filter: new FilterInfo("AND", [
                new FilterItem({ field: "md_id", operator: "eq", value: metaInfo.tableMetadata.md_id.toString(), fixed: true })
            ])
        };

        propFromField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propFromField.mc_nome_colonna}`, [null, propFromField], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propFromField);

        let propToField = MetadatiColonna.clone(propFromField);
        propToField.mc_nome_colonna = "toField";
        propToField.mc_display_string_in_edit = "TO date field Name";
        propToField.mc_ui_size_width = "100%";

        propToField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propToField.mc_nome_colonna}`, [null, propToField], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propToField);

        let propTitleField = MetadatiColonna.clone(propToField);
        propTitleField.mc_nome_colonna = "titleField";
        propTitleField.mc_display_string_in_edit = "'Scheduler event title' field Name";
        propTitleField.mc_ui_size_width = "100%";

        propTitleField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propTitleField.mc_nome_colonna}`, [null, propTitleField], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propTitleField);

        let propItemTemplateString = new MetadatiColonna("itemTemplateString");
        propItemTemplateString.mc_display_string_in_edit = "Item Template";
        propItemTemplateString.mc_ui_column_type = "txt_area";
        propItemTemplateString.mc_ui_lookup_entity_name = META_COLUMN_ROUTE;
        propItemTemplateString.mc_ui_lookup_dataTextField = "mc_display_string_in_edit";
        propItemTemplateString.mc_ui_lookup_dataValueField = "mc_nome_colonna";
        propItemTemplateString.mc_ui_size_width = "100%";

        propItemTemplateString.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propItemTemplateString.mc_nome_colonna}`, [null, propItemTemplateString], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propItemTemplateString);

        let propTitleFunction = MetadatiColonna.clone(propItemTemplateString);
        propTitleFunction.mc_nome_colonna = "titleFunction";
        propTitleFunction.mc_display_string_in_edit = "Item title function";
        propTitleFunction.mc_ui_size_width = "100%";

        propTitleFunction.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propTitleFunction.mc_nome_colonna}`, [null, propTitleFunction], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propTitleFunction);

        let mi = new MetaInfo();
        mi.columnMetadata = props;

        return mi;
    }
}
