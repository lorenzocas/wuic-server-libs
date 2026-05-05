import { BehaviorSubject } from "rxjs";
import { DataSourceComponent } from "../component/data-source/data-source.component";
import { FilterInfo } from "./filterInfo";
import { FilterItem } from "./filterItem";
import { IDesignerProperties } from "./IDesignerProperties";
import { MetadatiColonna } from "./metadati_colonna";
import { MetaInfo } from "./metaInfo";
import { WtoolboxService } from "../service/wtoolbox.service";

const META_COLUMN_ROUTE = " metadati  colonne";

export class MapOptions implements IDesignerProperties {
    mapId: string;
    zoom: number;
    center: Point;
    minZoom: number;
    maxZoom: number;

    useCurrentLocation: boolean;
    useClusterer: boolean;
    filterByBoundaries: boolean;

    customMarkerImageSrc: string;
    customMarkerImageSrcField: string;
    markerContentCallback: string;

    titleField: string;

    infoField: string;
    infoFunction: string;
    itemTemplateString: string;

    constructor() {
        // this.useCurrentLocation = false;
        // this.useClusterer = true;

        this.center = new Point();
    }

    init(metaInfo: MetaInfo) {
        if (metaInfo.tableMetadata.extraProps.archetypes.map) {
            let map = metaInfo.tableMetadata.extraProps.archetypes.map;

            this.mapId = map.mapId;
            this.zoom = map.zoom;
            this.center = map.center;
            this.minZoom = map.minZoom;
            this.maxZoom = map.maxZoom;

            this.useCurrentLocation = map.useCurrentLocation;
            this.useClusterer = map.useClusterer;
            this.filterByBoundaries = map.filterByBoundaries;

            this.customMarkerImageSrc = map.customMarkerImageSrc;
            this.customMarkerImageSrcField = map.customMarkerImageSrcField;
            this.markerContentCallback = map.markerContentCallback;

            this.titleField = map.titleField;

            this.infoField = map.infoField;
            this.infoFunction = map.infoFunction;
            this.itemTemplateString = map.itemTemplateString;

            this.center = new Point();

            if (metaInfo.tableMetadata.extraProps.archetypes.map.center && metaInfo.tableMetadata.extraProps.archetypes.map.center.lat && metaInfo.tableMetadata.extraProps.archetypes.map.center.lng) {
                this.center.lat = map.center.lat;
                this.center.lng = map.center.lng;
            } else {
                this.center.lat = null;
                this.center.lng = null;
            }
        }
    }

    archetypePropName: string = "map";

    public getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo {
        let props = [];

        let propMapId = new MetadatiColonna("mapId");
        propMapId.mc_display_string_in_edit = "Map Id";
        propMapId.mc_ui_column_type = "text";
        propMapId.mc_ui_size_width = "100%";

        propMapId.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propMapId.mc_nome_colonna}`, [null, propMapId], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propMapId);

        let propZoom = new MetadatiColonna("zoom");
        propZoom.mc_display_string_in_edit = "Zoom level";
        propZoom.mc_ui_column_type = "number";
        propZoom.mc_ui_size_width = "100%";

        propZoom.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propZoom.mc_nome_colonna}`, [null, propZoom], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propZoom);

        let propcenter = new MetadatiColonna("center");
        propcenter.mc_display_string_in_edit = "Center";
        propcenter.mc_ui_column_type = "objectProp";
        propcenter.propConstructor = Point; // unused

        props.push(propcenter);

        let propMinZoom = new MetadatiColonna("minZoom");
        propMinZoom.mc_display_string_in_edit = "Min Zoom level";
        propMinZoom.mc_ui_column_type = "number";
        propMinZoom.mc_ui_size_width = "100%";
        propMinZoom.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propMinZoom.mc_nome_colonna}`, [null, propMinZoom], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propMinZoom);

        let propMaxZoom = new MetadatiColonna("maxZoom");
        propMaxZoom.mc_display_string_in_edit = "Max Zoom level";
        propMaxZoom.mc_ui_column_type = "number";
        propMaxZoom.mc_ui_size_width = "100%";
        propMaxZoom.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propMaxZoom.mc_nome_colonna}`, [null, propMaxZoom], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propMaxZoom);

        let propUseCurrentLocation = new MetadatiColonna("useCurrentLocation");
        propUseCurrentLocation.mc_display_string_in_edit = "Use current location";
        propUseCurrentLocation.mc_ui_column_type = "boolean";
        propUseCurrentLocation.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propUseCurrentLocation.mc_nome_colonna}`, [null, propUseCurrentLocation], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propUseCurrentLocation);

        let propUseClusterer = new MetadatiColonna("useClusterer");
        propUseClusterer.mc_display_string_in_edit = "Use clusterer";
        propUseClusterer.mc_ui_column_type = "boolean";
        propUseClusterer.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propUseClusterer.mc_nome_colonna}`, [null, propUseClusterer], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propUseClusterer);

        let propFilterByBoundaries = new MetadatiColonna("filterByBoundaries");
        propFilterByBoundaries.mc_display_string_in_edit = "Filter by boundaries";
        propFilterByBoundaries.mc_ui_column_type = "boolean";
        propFilterByBoundaries.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propFilterByBoundaries.mc_nome_colonna}`, [null, propFilterByBoundaries], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propFilterByBoundaries);

        let propCustomMarkerImageSrc = new MetadatiColonna("customMarkerImageSrc");
        propCustomMarkerImageSrc.mc_display_string_in_edit = "Custom marker image source";
        propCustomMarkerImageSrc.mc_ui_column_type = "text";
        propCustomMarkerImageSrc.mc_ui_size_width = "100%";
        propCustomMarkerImageSrc.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propCustomMarkerImageSrc.mc_nome_colonna}`, [null, propCustomMarkerImageSrc], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propCustomMarkerImageSrc);

        let propCustomMarkerImageSrcField = new MetadatiColonna("customMarkerImageSrcField");
        propCustomMarkerImageSrcField.mc_display_string_in_edit = "Custom marker image source field";
        propCustomMarkerImageSrcField.mc_ui_column_type = "lookupByID";
        propCustomMarkerImageSrcField.mc_ui_lookup_entity_name = META_COLUMN_ROUTE;
        propCustomMarkerImageSrcField.mc_ui_lookup_dataTextField = "mc_display_string_in_edit";
        propCustomMarkerImageSrcField.mc_ui_lookup_dataValueField = "mc_nome_colonna";
        propCustomMarkerImageSrcField.mc_ui_size_width = "100%";

        propCustomMarkerImageSrcField.extras.lookup = {
            filter: new FilterInfo("AND", [
                new FilterItem({ field: "md_id", operator: "eq", value: metaInfo.tableMetadata.md_id.toString(), fixed: true })
            ])
        };

        propCustomMarkerImageSrcField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propCustomMarkerImageSrcField.mc_nome_colonna}`, [null, propCustomMarkerImageSrcField], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propCustomMarkerImageSrcField);

        let propMarkerContentCallback = new MetadatiColonna("markerContentCallback");
        propMarkerContentCallback.mc_display_string_in_edit = "Marker content callback";
        propMarkerContentCallback.mc_ui_column_type = "txt_area";
        propMarkerContentCallback.mc_ui_size_width = "100%";
        propMarkerContentCallback.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propMarkerContentCallback.mc_nome_colonna}`, [null, propMarkerContentCallback], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propMarkerContentCallback);

        let propTitleField = MetadatiColonna.clone(propCustomMarkerImageSrcField);
        propTitleField.mc_nome_colonna = "titleField";
        propTitleField.mc_display_string_in_edit = "Title field";
        propTitleField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propTitleField.mc_nome_colonna}`, [null, propTitleField], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propTitleField);

        let propInfoField = MetadatiColonna.clone(propTitleField);
        propInfoField.mc_nome_colonna = "infoField";
        propInfoField.mc_display_string_in_edit = "Info field";
        propInfoField.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propInfoField.mc_nome_colonna}`, [null, propInfoField], newValue ? newValue.mc_nome_colonna : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propInfoField);

        let propInfoFunction = new MetadatiColonna("infoFunction");
        propInfoFunction.mc_display_string_in_edit = "Info function";
        propInfoFunction.mc_ui_column_type = "txt_area";
        propInfoFunction.mc_ui_size_width = "100%";
        propInfoFunction.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.${propInfoFunction.mc_nome_colonna}`, [null, propInfoFunction], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(propInfoFunction);

        let propItemTemplateString = new MetadatiColonna("itemTemplateString");
        propItemTemplateString.mc_display_string_in_edit = "Item template string";
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

export class Point {
    lat: number;
    lng: number;

    archetypePropName: string = "map";

    constructor() {

    }

    public getDesignerProps(metaInfo: MetaInfo, action: BehaviorSubject<any>): MetaInfo {
        let props = [];

        let proplat = new MetadatiColonna("lat");
        proplat.mc_display_string_in_edit = "Latitude";
        proplat.mc_ui_column_type = "number";
        proplat.mc_ui_size_width = "100%";

        proplat.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.center.${proplat.mc_nome_colonna}`, [null, MapOptions], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(proplat);

        let proplng = new MetadatiColonna("lng");
        proplng.mc_display_string_in_edit = "Longitude";
        proplng.mc_ui_column_type = "number";
        proplng.mc_ui_size_width = "100%";

        proplng.mc_selection_changed_custom_function__fn = (record, field, mi, newValue) => {
            WtoolboxService.safeAssign(metaInfo.tableMetadata.extraProps, `archetypes.${this.archetypePropName}.center.${proplng.mc_nome_colonna}`, [null, MapOptions], newValue ? newValue : undefined);
            action.next(this.archetypePropName);
        };

        props.push(proplng);

        let mi = new MetaInfo();
        mi.columnMetadata = props;

        return mi;
    }
}
