import { BehaviorSubject } from "rxjs";
import { IDesignerProperties } from "./IDesignerProperties";
import { MetadatiColonna } from "./metadati_colonna";
import { MetaInfo } from "./metaInfo";
import { WtoolboxService } from "../service/wtoolbox.service";
import { FilterInfo } from "./filterInfo";
import { FilterItem } from "./filterItem";

const META_COLUMN_ROUTE = " metadati  colonne";

export interface KanbanStatusColumn {
  value: any;
  label: string;
  color?: string;
  order?: number;
  wipLimit?: number | null;
  wipLimitHard?: boolean;
}

export class KanbanOptions implements IDesignerProperties {
  statusField: string;
  colorField: string;
  wipLimitField: string;
  wipLimitHardField: string;
  assignedUserIdField: string;
  statusColumns: KanbanStatusColumn[];
  titleField: string;
  descriptionField: string;
  cardSubtitleField: string;
  clickAction: 'none' | 'detail' | 'edit';
  persistMode: 'immediate' | 'batch';

  archetypePropName: string = 'kanban';

  constructor() {
    this.statusColumns = [];
    this.clickAction = 'detail';
    this.persistMode = 'immediate';
  }

  init(metaInfo: MetaInfo): void {
    const kanban: any = metaInfo?.tableMetadata?.extraProps?.archetypes?.kanban || {};
    this.statusField = kanban.statusField ?? this.statusField;
    this.colorField = kanban.colorField ?? this.colorField;
    this.wipLimitField = kanban.wipLimitField ?? this.wipLimitField;
    this.wipLimitHardField = kanban.wipLimitHardField ?? this.wipLimitHardField;
    this.assignedUserIdField = kanban.assignedUserIdField ?? this.assignedUserIdField;
    this.statusColumns = Array.isArray(kanban.statusColumns) ? kanban.statusColumns : (this.statusColumns || []);
    this.titleField = kanban.titleField ?? this.titleField;
    this.descriptionField = kanban.descriptionField ?? this.descriptionField;
    this.cardSubtitleField = kanban.cardSubtitleField ?? this.cardSubtitleField;
    this.clickAction = kanban.clickAction ?? this.clickAction;
    this.persistMode = kanban.persistMode ?? this.persistMode;
  }

  public getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo {
    const props: MetadatiColonna[] = [];

    const makeColumnLookup = (name: string, label: string) => {
      const p = new MetadatiColonna(name);
      p.mc_display_string_in_edit = label;
      p.mc_ui_column_type = 'lookupByID';
      p.mc_ui_lookup_entity_name = META_COLUMN_ROUTE;
      p.mc_ui_lookup_dataTextField = 'mc_display_string_in_edit';
      p.mc_ui_lookup_dataValueField = 'mc_nome_colonna';
      p.mc_ui_size_width = '100%';
      p.extras.lookup = {
        filter: new FilterInfo('AND', [
          new FilterItem({ field: 'md_id', operator: 'eq', value: metaInfo.tableMetadata.md_id?.toString(), fixed: true })
        ])
      };
      p.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
        WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${name}`, [null, KanbanOptions], newValue ? newValue.mc_nome_colonna : undefined);
        action.next(this.archetypePropName);
      };
      return p;
    };

    props.push(makeColumnLookup('statusField', 'Status Field'));
    const colorField = new MetadatiColonna('colorField');
    colorField.mc_display_string_in_edit = 'Color Field (lookup route)';
    colorField.mc_ui_column_type = 'text';
    colorField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
      WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.colorField`, [null, KanbanOptions], String(newValue || '').trim());
      action.next(this.archetypePropName);
    };
    props.push(colorField);

    const wipLimitField = new MetadatiColonna('wipLimitField');
    wipLimitField.mc_display_string_in_edit = 'WIP Limit Field (lookup route)';
    wipLimitField.mc_ui_column_type = 'text';
    wipLimitField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
      WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.wipLimitField`, [null, KanbanOptions], String(newValue || '').trim());
      action.next(this.archetypePropName);
    };
    props.push(wipLimitField);

    const wipLimitHardField = new MetadatiColonna('wipLimitHardField');
    wipLimitHardField.mc_display_string_in_edit = 'WIP Limit Hard Field (lookup route)';
    wipLimitHardField.mc_ui_column_type = 'text';
    wipLimitHardField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
      WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.wipLimitHardField`, [null, KanbanOptions], String(newValue || '').trim());
      action.next(this.archetypePropName);
    };
    props.push(wipLimitHardField);

    props.push(makeColumnLookup('assignedUserIdField', 'Assigned User Id Field'));
    props.push(makeColumnLookup('titleField', 'Title Field'));
    props.push(makeColumnLookup('descriptionField', 'Description Field'));
    props.push(makeColumnLookup('cardSubtitleField', 'Subtitle Field'));

    const clickAction = new MetadatiColonna('clickAction');
    clickAction.mc_display_string_in_edit = 'Click Action';
    clickAction.mc_ui_column_type = 'dictionary';
    clickAction.mc_dictionary_value = 'none@@none||detail@@detail||edit@@edit';
    clickAction.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
      WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.clickAction`, [null, KanbanOptions], newValue);
      action.next(this.archetypePropName);
    };
    props.push(clickAction);

    const persistMode = new MetadatiColonna('persistMode');
    persistMode.mc_display_string_in_edit = 'Persist Mode';
    persistMode.mc_ui_column_type = 'dictionary';
    persistMode.mc_dictionary_value = 'immediate@@immediate||batch@@batch';
    persistMode.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
      WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.persistMode`, [null, KanbanOptions], newValue);
      action.next(this.archetypePropName);
    };
    props.push(persistMode);

    const statusColumns = new MetadatiColonna('statusColumns');
    statusColumns.mc_display_string_in_edit = 'Status Columns';
    statusColumns.mc_ui_column_type = 'objectArray';
    statusColumns.propConstructor = KanbanStatusColumnItem;
    statusColumns.mc_selection_changed_custom_function__fn = (record, field, mi, newValue: any[]) => {
      WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.statusColumns`, [null, KanbanOptions], Array.isArray(newValue) ? newValue : []);
      action.next(this.archetypePropName);
    };
    props.push(statusColumns);

    const mi = new MetaInfo();
    mi.tableMetadata = metaInfo.tableMetadata;
    mi.columnMetadata = props;
    return mi;
  }
}

export class KanbanStatusColumnItem implements IDesignerProperties {
  value: any;
  label: string;
  color: string;
  order: number;
  wipLimit: number;

  archetypePropName: string = 'kanban';

  init(metaInfo: MetaInfo): void {
    return;
  }

  public getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo {
    const props: MetadatiColonna[] = [];

    const value = new MetadatiColonna('value');
    value.mc_display_string_in_edit = 'Value';
    value.mc_ui_column_type = 'text';
    props.push(value);

    const label = new MetadatiColonna('label');
    label.mc_display_string_in_edit = 'Label';
    label.mc_ui_column_type = 'text';
    props.push(label);

    const color = new MetadatiColonna('color');
    color.mc_display_string_in_edit = 'Color';
    color.mc_ui_column_type = 'color';
    props.push(color);

    const order = new MetadatiColonna('order');
    order.mc_display_string_in_edit = 'Order';
    order.mc_ui_column_type = 'number';
    props.push(order);

    const wipLimit = new MetadatiColonna('wipLimit');
    wipLimit.mc_display_string_in_edit = 'WIP Limit';
    wipLimit.mc_ui_column_type = 'number';
    props.push(wipLimit);

    const mi = new MetaInfo();
    mi.tableMetadata = metaInfo.tableMetadata;
    mi.columnMetadata = props;
    return mi;
  }
}
