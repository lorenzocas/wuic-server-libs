import { DataSourceComponent } from "../component/data-source/data-source.component";
import { WtoolboxService } from "../service/wtoolbox.service";
import { MetaInfo } from "./metaInfo";

export class MetadatiCustomActionTabella {
    __user_id?: number;

    Id?: number;
    button_template?: string;
    button_image?: string;
    button_caption: string;
    tooltip?: string;

    _disabled?: boolean;

    action_callback?: string;
    disable_callback?: string;
    action_callback__fn: ((datasource: DataSourceComponent, metaInfo: MetaInfo, record: any, event: any, wtoolbox: typeof WtoolboxService) => void);
    disable_callback__fn?: ((datasource: DataSourceComponent, metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean);

    md_id?: number;
    md_action_type?: number;

    ordine?: number;

    constructor() {

    }
}
