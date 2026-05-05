import { Pipe, PipeTransform } from '@angular/core';
import { MetadatiColonna } from '../class/metadati_colonna';
import { WtoolboxService } from '../service/wtoolbox.service';
import { MetaInfo } from '../class/metaInfo';

@Pipe({
  name: 'getSrcUploadPreview',
  standalone: true
})
export class GetSrcUploadPreviewPipe implements PipeTransform {

  transform(value: string, UploadField: MetadatiColonna, metaInfo: MetaInfo, record: any, thumb?: boolean): string {
    let src = '';
    let pkName = metaInfo.columnMetadata.find((col) => col.mc_is_primary_key).mc_nome_colonna;
    let route = metaInfo.tableMetadata.md_route_name;

    if (UploadField) {
      if (UploadField.isImageUpload) {
        if (!UploadField.isDBUpload) {
          let img = UploadField.createThumb && thumb ? (value ? value.replace(/.([^.]+)$/, '_thumb\.$1') : '') : value;

          src = (UploadField.DefaultUploadRootPath ? UploadField.DefaultUploadRootPath : WtoolboxService.appSettings.upload_path) + (UploadField.UseRouteNameAsSubfolder ? route + '/' : '') + (UploadField.UseRecordIDAsSubfolder ? (record[pkName] ? (record[pkName].value ? record[pkName].value : record[pkName]) : null) + '/' : '') + img;

          // largeSrc = (ImgField.DefaultUploadRootPath ? ImgField.DefaultUploadRootPath : WtoolboxService.appSettings.upload_path) + (ImgField.UseRouteNameAsSubfolder ? route + '/' : '') + (ImgField.UseRecordIDAsSubfolder ? record[pkName] + '/' : '') + value;
        }
        else {
          src = WtoolboxService.appSettings.api_url + 'UploadImage?filename=' + value + '&mc_id=' + UploadField.mc_id + '&__id=' + (record[pkName] ? (record[pkName].value ? record[pkName].value : record[pkName]) : null);
          if (thumb && UploadField.createThumb) {
            src += '&preferThumbFs=true';
          }
        }
      } else {
        if (thumb) {
          return 'assets/icons/filetypes/' + value.split('.').pop() + '.svg';
        } else {
          if (!UploadField.isDBUpload) {
            src = (UploadField.DefaultUploadRootPath ? UploadField.DefaultUploadRootPath : WtoolboxService.appSettings.upload_path) + (UploadField.UseRouteNameAsSubfolder ? route + '/' : '') + (UploadField.UseRecordIDAsSubfolder ? (record[pkName] ? (record[pkName].value ? record[pkName].value : record[pkName]) : null) + '/' : '') + value;
          } else {
            src = WtoolboxService.appSettings.api_url + 'UploadImage?filename=' + value + '&mc_id=' + UploadField.mc_id + '&__id=' + (record[pkName] ? (record[pkName].value ? record[pkName].value : record[pkName]) : null);
          }
        }
      }
    }

    return src;
  }

}
