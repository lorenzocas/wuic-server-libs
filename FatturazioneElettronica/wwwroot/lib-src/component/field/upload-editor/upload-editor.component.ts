import { Component, Input, OnInit, AfterViewInit } from '@angular/core';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetaInfo } from '../../../class/metaInfo';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { BehaviorSubject } from 'rxjs';
import { FileUploadModule } from 'primeng/fileupload';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { UserInfoService } from '../../../service/user-info.service';
import { DataSourceComponent } from '../../data-source/data-source.component';
import { mime } from '../../../handler/mime';
import { AsyncPipe } from '@angular/common';
import { PrimeNG } from 'primeng/config';
import { GetSrcUploadPreviewPipe } from '../../../pipe/get-src-upload-preview.pipe';
import { ImageModule } from 'primeng/image';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'wuic-upload-editor',
  imports: [FileUploadModule, TranslateModule, AsyncPipe, GetSrcUploadPreviewPipe, ImageModule, ButtonModule],
  templateUrl: './upload-editor.component.html',
  styleUrl: './upload-editor.component.scss'
})
export class UploadEditorComponent implements OnInit, AfterViewInit {
  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record: { [key: string]: BehaviorSubject<any> };
  /**
   * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
   */
  @Input() field: MetadatiColonna;
  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: MetaInfo = new MetaInfo();
  /**
   * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
   */
  @Input() isFilter?: boolean;
  /**
   * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
   */
  @Input() nestedIndex: number;
  /**
   * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
   */
  @Input() triggerProp: BehaviorSubject<any>;
  /**
   * Input dal componente padre per tabindex; usata nella configurazione e nel rendering del componente.
   */
  @Input() tabIndex?: number;
  /**
   * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
   */
  @Input() readOnly: boolean;

  /**
   * Proprieta di stato del componente per upload path, usata dalla logica interna e dal template.
   */
  uploadPath: string;
  /**
   * Proprieta di stato del componente per upload endpoint, usata dalla logica interna e dal template.
   */
  uploadEndpoint: string;
  /**
   * Proprieta di stato del componente per mime types, usata dalla logica interna e dal template.
   */
  mimeTypes: string;
  /**
   * Proprieta di stato del componente per max file size, usata dalla logica interna e dal template.
   */
  maxFileSize: number;
  /**
   * Proprieta di stato del componente per pk name, usata dalla logica interna e dal template.
   */
  pkName: string;

  /**
   * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
   */
  valore: any;

  /**
* function Object() { [native code] }
* @param trnsl Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param usrSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param config Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
*/
  constructor(private trnsl: TranslateService, private usrSrv: UserInfoService, private config: PrimeNG) {
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit() {
    this.pkName = this.metaInfo.columnMetadata.find((col) => col.mc_is_primary_key)!.mc_nome_colonna;

    // this.uploadPath = (this.field.DefaultUploadRootPath ? this.field.DefaultUploadRootPath : WtoolboxService.appSettings.upload_path) + (this.field.UseRouteNameAsSubfolder ? this.metaInfo.tableMetadata.md_route_name + '/' : '') + (this.field.UseRecordIDAsSubfolder ? ((this.record[pkName] || this.record["__guid"]) + '/') : '');

    this.uploadEndpoint = this.field.customUploadHandlerPath ? this.field.customUploadHandlerPath : WtoolboxService.appSettings.upload_handler;

    this.mimeTypes = this.field.allowed_file_types;
    this.maxFileSize = this.field.max_file_size;
  }

  ngAfterViewInit() {
    this.valore = this.record[this.field.mc_nome_colonna].value;

    if (this.valore) {
      if (this.field.mc_selection_changed_custom_function__fn) {
        this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, this.valore, null, WtoolboxService, this.nestedIndex);
      }
    }

    if (!this.field.editor) {
      this.field.editor = new BehaviorSubject<any>(null);
    }

    this.field.editor.next(this);
  }


  /**
* Gestisce la logica operativa di `choose` in modo coerente con l'implementazione corrente.
* @param event Evento che innesca il comportamento del metodo.
* @param callback Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  choose(event, callback) {
    callback();
  }

  /**
* Gestisce la logica di `onFileSelect` orchestrando le chiamate `getType` e `split`.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
*/
  onFileSelect($event) {
    let file = $event.files[0];

    let filename = file.name;
    let filetype = mime.getType(file.name, file.type);
    let filesyze = file.size;
    let allowedTypes = this.field.allowed_file_types;
    let maxFileSize = this.field.max_file_size;

    if (this.field.extras.uploader && this.field.extras.uploader.beforeUpload) {
      let prevent = false;
      // if (angular.isFunction(field.extras.uploader.beforeUpload)) {
      //   field.extras.uploader.beforeUpload(e, field, record, scope, file, wtoolbox, RouteSrvc);
      // }
      // else {
      //   new Function("event, field, record, scope, file, wtoolbox, RouteSrvc", field.extras.uploader.beforeUpload)(e, field, record, scope, file, wtoolbox, RouteSrvc);
      // }
      // if (prevent) {
      //   e.preventDefault();
      //   return;
      // }
    }

    if (allowedTypes) {
      let types = allowedTypes.split(";");
      if (!types.includes(filetype)) {
        WtoolboxService.messageNotificationService.add({ severity: 'warn', summary: this.trnsl.instant('allowed_file_types') });
        $event.originalEvent.preventDefault();
        return;
      }
    }

    if (maxFileSize) {
      if ((parseFloat(filesyze) / 1024) > maxFileSize) {
        WtoolboxService.messageNotificationService.add({ severity: 'warn', summary: this.trnsl.instant('localize_max_file_size') });
        $event.originalEvent.preventDefault();
        return;
      }
    }

  }

  /**
* Gestisce la logica di `onBeforeUpload` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @param $event Evento UI/payload evento che innesca la logica del metodo.
*/
  onBeforeUpload($event) {
    let formData: FormData = $event.formData;

    let pkey = this.metaInfo.columnMetadata.find((col) => col.mc_is_primary_key)!;
    let pkeyValue = this.record && this.record[pkey.mc_nome_colonna] ? this.record[pkey.mc_nome_colonna].value : null;

    //#region metadata upload

    let data_id = pkeyValue || (this.record && this.record["__guid"] ? this.record["__guid"].value : null);

    // if (this.field.key_field_name) {
    //   data_id = this.record ? this.record[this.field.key_field_name] : null;
    // }

    if (!data_id) {
      data_id = WtoolboxService.uuidv4();
    }

    // if (this.field.mc_show_long_running_progress)
    //   uploadRequestInfo = wtoolbox.ui.toggleProgress(null);

    let upOpts = [
      { name: 'isImageUpload', value: this.field.isImageUpload },
      { name: 'isDBUpload', value: this.field.isDBUpload },
      { name: 'isMultipleUpload', value: this.field.isMultipleUpload },
      { name: 'IsZippedUpload', value: this.field.IsZippedUpload },
      { name: 'AllowWebCamShot', value: this.field.AllowWebCamShot },
      { name: 'AllowWebCamVideo', value: this.field.AllowWebCamVideo },
      { name: 'UseRecordIDAsSubfolder', value: this.field.UseRecordIDAsSubfolder },
      { name: 'key_field_name', value: this.field.key_field_name },
      { name: 'UseRootNameAsSubfolder', value: this.field.UseRouteNameAsSubfolder },
      { name: 'DefaultUploadRootPath', value: this.field.DefaultUploadRootPath },
      { name: 'MultipleUploadTableRoute', value: this.field.MultipleUploadTableRoute },
      { name: 'MultipleUploadBlobFieldName', value: this.field.MultipleUploadBlobFieldName },
      { name: 'MultipleUploadBlobThumbFieldName', value: this.field.MultipleUploadBlobThumbFieldName },
      { name: 'MultipleUploadFilePathFieldName', value: this.field.MultipleUploadFilePathFieldName },
      { name: 'MultipleUploadFileTitleFieldName', value: this.field.MultipleUploadFileTitleFieldName },
      { name: 'MultipleUploadFileNameFieldName', value: this.field.MultipleUploadFileNameFieldName },
      { name: 'MultipleUploadFileSizeFieldName', value: this.field.MultipleUploadFileSizeFieldName },
      { name: 'MultipleUploadFileTypeFieldName', value: this.field.MultipleUploadFileTypeFieldName },
      { name: 'MultipleUploadFileIconPathFieldName', value: this.field.MultipleUploadFileIconPathFieldName },
      { name: 'createThumb', value: this.field.createThumb },
      { name: 'thumbWidth', value: this.field.thumbWidth },
      { name: 'thumbHeight', value: this.field.thumbHeight },
      { name: 'customUploadHandlerPath', value: this.field.customUploadHandlerPath },
      { name: 'upload_secure', value: this.field.upload_secure },
      { name: 'data_id', value: data_id },
      { name: 'user_id', value: this.usrSrv.getuserInfo().user_id },
      { name: 'route_name', value: this.metaInfo.tableMetadata.md_route_name == "Import_System_dummy_table" ? this.record['destination_route'] : this.metaInfo.tableMetadata.md_route_name },
      { name: 'mc_nome_colonna', value: this.field.ang_name },
      { name: 'record', value: JSON.stringify(DataSourceComponent.getModelFromObservable(this.record, this.metaInfo)) },
      { name: "returnMessage", value: "" },
      // { name: "requestID", value: uploadRequestInfo ? uploadRequestInfo.requestId : null }
    ];

    if (this.metaInfo.tableMetadata.md_route_name == "Import_System_dummy_table") {
      upOpts.push({ name: "fyle_type", value: this.record['colonna_001_testo'] });
      upOpts.push({ name: "import_type", value: this.record['colonna_003_testo'] });
      upOpts.push({ name: "commit_level", value: this.record['colonna_004_testo'] });
      upOpts.push({ name: "use_column_captions", value: this.record['colonna_006_testo'] });
      upOpts.push({ name: "use_descriptive_fkey", value: this.record['colonna_001_numero'] || false });
      upOpts.push({ name: "separator", value: this.record['colonna_008_testo'] });
    }

    upOpts.forEach(prop => {
      formData.append(prop.name, prop.value);
    });

  }

  /**
* Gestisce la logica di `onUpload` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
*/
  async onUpload($event) {

    let response = $event.originalEvent.body[0];

    let base64Content = response.base64Content;
    let filename = response.name;
    let filetype = response.type;
    let filesyze = response.size;
    let uploadOpt = response.uploadOpt;

    let guid = uploadOpt.data_id;

    this.record[this.field.mc_nome_colonna].next(filename);

    if (this.field.mc_selection_changed_custom_function__fn) {
      await Promise.resolve(this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, filename, this.valore, WtoolboxService, this.nestedIndex));
    }

    this.valore = filename;
  }

  /**
* Gestisce la logica operativa di `formatSize` in modo coerente con l'implementazione corrente.
* @param bytes Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore stringa restituito da `formatSize`.
*/
  formatSize(bytes) {
    const k = 1024;
    const dm = 3;
    const sizes = this.config.translation.fileSizeTypes;
    if (bytes === 0) {
      return `0 ${sizes[0]}`;
    }

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const formattedSize = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));

    return `${formattedSize} ${sizes[i]}`;
  }

  /**
* Esegue l'operazione di persistenza/sincronizzazione in `removeAttachment` aggiornando lo stato locale quando necessario.
* @param field Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  removeAttachment(field) {
    this.record[field.mc_nome_colonna].next(null);
  }
}


