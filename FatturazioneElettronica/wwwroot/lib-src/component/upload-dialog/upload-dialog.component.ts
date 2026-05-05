import { Component, Optional, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileUploadModule } from 'primeng/fileupload';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { MessageModule } from 'primeng/message';
import { TranslateModule } from '@ngx-translate/core';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { UserInfoService } from '../../service/user-info.service';

/**
 * Dialog programmatico aperto da `WtoolboxService.uploadDialog`.
 * Renderizza un PrimeNG p-fileUpload (mode="basic", customUpload) e gestisce internamente
 * la chiamata al backend `UploadHandlerCustom` con `invoke_upload_to_table=true`,
 * passando target_table / stored_name / target_mode.
 *
 * Il dialog si chiude con il payload backend in caso di successo, o `undefined`
 * se l'utente annulla. In caso di errore backend resta aperto e mostra il messaggio.
 */
@Component({
  selector: 'wuic-upload-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, FileUploadModule, ButtonModule, ProgressBarModule, MessageModule, TranslateModule],
  templateUrl: './upload-dialog.component.html',
  styleUrl: './upload-dialog.component.scss'
})
export class UploadDialogComponent implements OnInit {
  targetTable: string = '';
  storedName: string = '';
  targetMode: 'replace' | 'truncate' | 'append' = 'replace';
  accept: string = '.xls,.xlsx,.csv';
  maxFileSize: number = 50 * 1024 * 1024; // 50 MB
  routeName: string = '';
  chooseLabel: string = 'Scegli file';

  selectedFile: File | null = null;
  selectedFileName: string = '';
  uploading: boolean = false;
  errorMessage: string = '';

  constructor(
    @Optional() public ref: DynamicDialogRef | null,
    @Optional() public config: DynamicDialogConfig | null,
    @Optional() private userInfo: UserInfoService | null
  ) { }

  ngOnInit(): void {
    const data = this.config?.data || {};
    this.targetTable = String(data.target_table || '').trim();
    this.storedName = String(data.stored_name || '').trim();
    const mode = String(data.mode || 'replace').toLowerCase();
    this.targetMode = (mode === 'truncate' || mode === 'append') ? mode as any : 'replace';
    if (data.accept) this.accept = String(data.accept);
    if (data.maxFileSize && Number.isFinite(Number(data.maxFileSize))) this.maxFileSize = Number(data.maxFileSize);
    if (data.routeName) this.routeName = String(data.routeName);
    if (data.chooseLabel) this.chooseLabel = String(data.chooseLabel);
  }

  onFileSelect(event: any): void {
    const file: File | undefined = event?.files?.[0] || event?.currentFiles?.[0];
    this.selectedFile = file || null;
    this.selectedFileName = file ? file.name : '';
    this.errorMessage = '';
  }

  onFileClear(): void {
    this.selectedFile = null;
    this.selectedFileName = '';
    this.errorMessage = '';
  }

  async onConfirm(): Promise<void> {
    if (this.uploading) return;
    if (!this.selectedFile) {
      this.errorMessage = 'Seleziona un file prima di confermare.';
      return;
    }
    if (!this.targetTable || !this.storedName) {
      this.errorMessage = 'target_table o stored_name mancanti.';
      return;
    }

    this.uploading = true;
    this.errorMessage = '';

    try {
      const file = this.selectedFile;
      const fileExt = (file.name.split('.').pop() || '').toLowerCase();
      const isCsv = (fileExt === 'csv' || fileExt === 'txt');
      const userId = this.userInfo?.getuserInfo?.()?.user_id ?? '';
      const apiBaseRaw = WtoolboxService.appSettings?.api_url || (window.location.origin + '/api/');
      const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw : `${apiBaseRaw}/`;
      const uploadEndpoint = String(WtoolboxService.appSettings?.upload_handler || `${apiBase}UploadImage`).trim();

      const formData = new FormData();
      formData.append('uploadEditor[]', file, file.name);
      formData.append('isImageUpload', 'false');
      formData.append('isDBUpload', 'false');
      formData.append('isMultipleUpload', 'false');
      formData.append('IsZippedUpload', 'false');
      formData.append('AllowWebCamShot', 'false');
      formData.append('AllowWebCamVideo', 'false');
      formData.append('UseRecordIDAsSubfolder', 'false');
      formData.append('UseRootNameAsSubfolder', 'false');
      formData.append('createThumb', 'false');
      formData.append('upload_secure', 'false');
      formData.append('data_id', (WtoolboxService.uuidv4 ? WtoolboxService.uuidv4() : String(Date.now())));
      formData.append('user_id', String(userId || ''));
      formData.append('route_name', String(this.routeName || ''));
      formData.append('mc_nome_colonna', '');
      formData.append('record', '{}');
      formData.append('returnMessage', '');
      formData.append('fyle_type', isCsv ? 'C' : 'X');
      formData.append('separator', ';');
      formData.append('invoke_upload_to_table', 'true');
      formData.append('upload_target_table', this.targetTable);
      formData.append('upload_stored_name', this.storedName);
      formData.append('upload_target_mode', this.targetMode);

      const response = await fetch(uploadEndpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      let payload: any = null;
      try { payload = await response.json(); } catch { payload = null; }
      const first = Array.isArray(payload) ? payload[0] : payload;
      const backendError = String(first?.error || '').trim();
      const backendMessage = String(first?.uploadOpt?.returnMessage || '').trim();
      const backendHasError = !!backendError || /exception|errore|error|object reference/i.test(backendMessage);

      if (!response.ok || backendHasError) {
        this.errorMessage = backendError || backendMessage || `Upload fallito (${response.status}).`;
        this.uploading = false;
        return;
      }

      // Successo: ritorna il payload al chiamante (action_callback) e chiudi.
      this.ref?.close({
        ok: true,
        message: backendMessage || 'Upload completato.',
        targetTable: this.targetTable,
        storedName: this.storedName,
        mode: this.targetMode,
        fileName: file.name,
        raw: first
      });
    } catch (err: any) {
      this.errorMessage = String(err?.message || err || 'Errore durante upload.');
      this.uploading = false;
    }
  }

  onCancel(): void {
    if (this.uploading) return;
    this.ref?.close(undefined);
  }
}
