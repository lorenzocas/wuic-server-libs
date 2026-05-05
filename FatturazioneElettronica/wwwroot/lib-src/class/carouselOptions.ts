import { FilterInfo } from "./filterInfo";
import { FilterItem } from "./filterItem";
import { MetadatiColonna } from "./metadati_colonna";
import { IDesignerProperties } from "./IDesignerProperties";
import { MetaInfo } from "./metaInfo";
import { WtoolboxService } from "../service/wtoolbox.service";
import { BehaviorSubject } from "rxjs";

const META_COLUMN_ROUTE = " metadati  colonne";

export class CarouselOptions implements IDesignerProperties {
    public imageFieldName: string;
    public descriptionFieldName: string;
    public imageWidth: number;
    public pageSize: number;
    public numVisible: number;
    public numScroll: number;
    public usePreview: boolean;
    public responsiveOptions: ResponsiveOption[];
    public itemTemplateString: string;

    constructor() {
        this.responsiveOptions = [];
    }
    init(metaInfo: MetaInfo) {
        const carousel: any = metaInfo?.tableMetadata?.extraProps?.archetypes?.carousel || {};

        this.imageFieldName = carousel.imageFieldName ?? this.imageFieldName;
        this.descriptionFieldName = carousel.descriptionFieldName ?? this.descriptionFieldName;
        this.imageWidth = carousel.imageWidth ?? this.imageWidth;
        this.pageSize = carousel.pageSize ?? this.pageSize;
        this.numVisible = carousel.numVisible ?? this.numVisible;
        this.numScroll = carousel.numScroll ?? this.numScroll;
        this.usePreview = carousel.usePreview ?? this.usePreview;
        this.itemTemplateString = carousel.itemTemplateString ?? this.itemTemplateString;
        this.responsiveOptions = Array.isArray(carousel.responsiveOptions) ? carousel.responsiveOptions : (this.responsiveOptions || []);
    }

    archetypePropName: string = "carousel";

    public getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo {
        let props = [];

        let propImageFieldName = new MetadatiColonna("imageFieldName");
        propImageFieldName.mc_display_string_in_edit = "Image Field Name";
        propImageFieldName.mc_ui_column_type = "lookupByID";
        propImageFieldName.mc_ui_lookup_entity_name = META_COLUMN_ROUTE;
        propImageFieldName.mc_ui_lookup_dataTextField = "mc_display_string_in_edit";
        propImageFieldName.mc_ui_lookup_dataValueField = "mc_nome_colonna";
        propImageFieldName.mc_ui_size_width = "100%";

        propImageFieldName.extras.lookup = {
            filter: new FilterInfo("AND", [
                new FilterItem({ field: "md_id", operator: "eq", value: metaInfo.tableMetadata.md_id.toString(), fixed: true })
            ])
        };

        propImageFieldName.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propImageFieldName.mc_nome_colonna}`, [null, CarouselOptions], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propImageFieldName);

        let propDescriptionFieldName = MetadatiColonna.clone(propImageFieldName);
        propDescriptionFieldName.mc_nome_colonna = "descriptionFieldName";
        propDescriptionFieldName.mc_display_string_in_edit = "Description Field Name";

        propDescriptionFieldName.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propDescriptionFieldName.mc_nome_colonna}`, [null, CarouselOptions], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propDescriptionFieldName);

        let propimageWidth = new MetadatiColonna("imageWidth");
        propimageWidth.mc_display_string_in_edit = "Image Width";
        propimageWidth.mc_ui_column_type = "number";
        propimageWidth.mc_ui_size_width = "100%";

        propimageWidth.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propimageWidth.mc_nome_colonna}`, [null, CarouselOptions], newValue);
            action.next(this.archetypePropName);
        };

        props.push(propimageWidth);

        let propnumVisible = new MetadatiColonna("numVisible");
        propnumVisible.mc_display_string_in_edit = "Num Visible";
        propnumVisible.mc_ui_column_type = "number";
        propnumVisible.mc_ui_size_width = "100%";

        propnumVisible.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propnumVisible.mc_nome_colonna}`, [null, CarouselOptions], newValue);
            action.next(this.archetypePropName);
        };

        props.push(propnumVisible);

        let propnumScroll = new MetadatiColonna("numScroll");
        propnumScroll.mc_display_string_in_edit = "Num Scroll";
        propnumScroll.mc_ui_column_type = "number";
        propnumScroll.mc_ui_size_width = "100%";

        propnumScroll.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propnumScroll.mc_nome_colonna}`, [null, CarouselOptions], newValue);
            action.next(this.archetypePropName);
        };

        props.push(propnumScroll);

        let propPreview = new MetadatiColonna("usePreview");
        propPreview.mc_display_string_in_edit = "Use Preview";
        propPreview.mc_ui_column_type = "boolean";

        propPreview.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propPreview.mc_nome_colonna}`, [null, CarouselOptions], newValue);
            action.next(this.archetypePropName);
        };

        props.push(propPreview);

        let propitemTemplateString = new MetadatiColonna("itemTemplateString");
        propitemTemplateString.mc_display_string_in_edit = "Item Template String";
        propitemTemplateString.mc_ui_column_type = "txt_area";
        propitemTemplateString.mc_ui_size_width = "100%";

        propitemTemplateString.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propitemTemplateString.mc_nome_colonna}`, [null, CarouselOptions], newValue);
            action.next(this.archetypePropName);
        };

        props.push(propitemTemplateString);

        let propresponsiveOptions = new MetadatiColonna("responsiveOptions");
        propresponsiveOptions.mc_display_string_in_edit = "Responsive Options";
        propresponsiveOptions.mc_ui_column_type = "objectArray";
        propresponsiveOptions.propConstructor = ResponsiveOption;

        propresponsiveOptions.mc_selection_changed_custom_function__fn = (record, field, mi, newValue: any[]) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propresponsiveOptions.mc_nome_colonna}`, [null, CarouselOptions], newValue ? newValue : []);
            action.next(this.archetypePropName);
        };

        props.push(propresponsiveOptions);

        let mi = new MetaInfo();
        mi.tableMetadata = metaInfo.tableMetadata;
        mi.columnMetadata = props;

        return mi;
    }
}

export class ResponsiveOption implements IDesignerProperties {
    public breakpoint: string;
    public numVisible: number;
    public numScroll: number;

    archetypePropName: string = "carousel";

    constructor() {

    }

    init(metaInfo: MetaInfo) {
        return;
    }

    public getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo {
        let props = [];

        let propbreakpoint = new MetadatiColonna("breakpoint");
        propbreakpoint.mc_display_string_in_edit = "Breakpoint resolution";
        propbreakpoint.mc_ui_column_type = "text";
        propbreakpoint.mc_ui_size_width = "100%";

        // NEED TO PASS ARRAY INDEX !!!!!
        propbreakpoint.mc_selection_changed_custom_function__fn = (record, field, mi, newValue: any[], oldVal, WtoolboxService, nestedIndex: number) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.responsiveOptions.${propbreakpoint.mc_nome_colonna}`, [null, CarouselOptions, []], newValue, nestedIndex);
            action.next(this.archetypePropName);
        };

        props.push(propbreakpoint);

        let propnumVisible = new MetadatiColonna("numVisible");
        propnumVisible.mc_display_string_in_edit = "Num Visible";
        propnumVisible.mc_ui_column_type = "number";
        propnumVisible.mc_ui_size_width = "100%";

        propnumVisible.mc_selection_changed_custom_function__fn = (record, field, mi, newValue: any[], oldVal, WtoolboxService, nestedIndex: number) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.responsiveOptions.${propnumVisible.mc_nome_colonna}`, [null, CarouselOptions, []], newValue, nestedIndex);
            action.next(this.archetypePropName);
        };

        props.push(propnumVisible);

        let propnumScroll = new MetadatiColonna("numScroll");
        propnumScroll.mc_display_string_in_edit = "Num Scroll";
        propnumScroll.mc_ui_column_type = "number";
        propnumScroll.mc_ui_size_width = "100%";

        propnumScroll.mc_selection_changed_custom_function__fn = (record, field, mi, newValue: any[], oldVal, WtoolboxService, nestedIndex: number) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.responsiveOptions.${propnumScroll.mc_nome_colonna}`, [null, CarouselOptions, []], newValue, nestedIndex);
            action.next(this.archetypePropName);
        };

        props.push(propnumScroll);

        let mi = new MetaInfo();
        mi.tableMetadata = metaInfo.tableMetadata;
        mi.columnMetadata = props;

        return mi;
    }
}
