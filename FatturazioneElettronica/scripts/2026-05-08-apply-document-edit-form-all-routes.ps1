# =============================================================================
# Patch: applica <app-document-edit-form> come md_edit_template alle 4 route
# documenti che ancora non lo hanno: ddt, ordini_acquisto, ordini_elettronici,
# proforma. Le altre 4 (fatture_inviate, fatture_ricevute, preventivi, ordini)
# erano gia' configurate.
#
# Effetto runtime per OGNI route post-patch:
#   - data_documento default = oggi
#   - anno default = anno corrente
#   - progressivo (o progressivo_interno) default da sp_next_progressivo
#   - numero auto-composto come "[serie ]<prog>/<anno>" + readonly span
#     (autoComposeNumero=true)
#   - per ordini_elettronici: numero_pa MANUALE (autoComposeNumero=false),
#     ma progressivo_interno + data_documento + anno restano default-popolati.
#
# Idempotente: aggiorna solo le route che NON hanno gia' app-document-edit-form.
# =============================================================================
Add-Type -AssemblyName "System.Data"
$conn = New-Object System.Data.SqlClient.SqlConnection `
  "Server=localhost\sqlexpress;Database=FatturazioneElettronica_Metadata;Integrated Security=True;TrustServerCertificate=True"
$conn.Open()

# Configurazione per route — ogni voce: { route, autoCompose, hasSerie, progField, template HTML }
$templates = @(
  @{
    route = 'ddt'
    template = @'
<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  routeName="ddt" progressivoField="progressivo"
  [autoComposeNumero]="true" [hasSerie]="false"
  [documentFields]="['numero','progressivo','anno','data_documento']"
  controparteTitle="Dati cliente"
  [controparteFields]="['cliente_id']"
  pagamentoTitle="Dati trasporto"
  [pagamentoFields]="['causale_trasporto','aspetto_beni','n_colli','peso_lordo','porto','vettore','data_ora_trasporto']"
  calcoloTitle="Stato"
  [calcoloFields]="['stato','fattura_id']"
  [noteFields]="['note']"></app-document-edit-form>
'@
  },
  @{
    route = 'ordini_acquisto'
    template = @'
<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  routeName="ordini_acquisto" progressivoField="progressivo"
  [autoComposeNumero]="true" [hasSerie]="false"
  [documentFields]="['numero','progressivo','anno','data_documento','data_consegna']"
  controparteTitle="Dati fornitore"
  [controparteFields]="['fornitore_id','riferimento']"
  calcoloTitle="Calcolo"
  [calcoloFields]="['imponibile','iva','totale']"
  statoTitle="Stato"
  [statoFields]="['stato']"
  [noteFields]="['note']"></app-document-edit-form>
'@
  },
  @{
    route = 'ordini_elettronici'
    template = @'
<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  routeName="ordini_elettronici" progressivoField="progressivo_interno"
  [autoComposeNumero]="false" [hasSerie]="false"
  [documentFields]="['numero_pa','progressivo_interno','anno','data_documento','data_ricezione','cig','cup','nso_message_id']"
  controparteTitle="Dati cliente"
  [controparteFields]="['cliente_id']"
  calcoloTitle="Calcolo"
  [calcoloFields]="['imponibile','iva','totale']"
  statoTitle="Stato"
  [statoFields]="['stato']"
  [noteFields]="['note']"></app-document-edit-form>
'@
  },
  @{
    route = 'proforma'
    template = @'
<app-document-edit-form
  [record]="record" [metaInfo]="metaInfo" [metas]="metas" [readOnly]="false"
  routeName="proforma" progressivoField="progressivo"
  [autoComposeNumero]="true" [hasSerie]="false"
  [documentFields]="['numero','progressivo','anno','data_documento']"
  controparteTitle="Dati cliente"
  [controparteFields]="['cliente_id']"
  calcoloTitle="Calcolo"
  [calcoloFields]="['imponibile','iva','totale']"
  statoTitle="Stato"
  [statoFields]="['stato','fattura_id']"
  [noteFields]="['note']"></app-document-edit-form>
'@
  }
)

foreach ($cfg in $templates) {
  # Skip se route gia' ha app-document-edit-form
  $check = $conn.CreateCommand()
  $check.CommandText = "SELECT CASE WHEN CAST(mdedittemplate AS NVARCHAR(MAX)) LIKE N'%app-document-edit-form%' THEN 1 ELSE 0 END FROM _metadati__tabelle WHERE mdroutename=@r"
  [void]$check.Parameters.AddWithValue('@r', $cfg.route)
  $has = $check.ExecuteScalar()
  if ($has -eq 1) {
    Write-Host "[$($cfg.route)] gia' configurato, skip"
    continue
  }

  $upd = $conn.CreateCommand()
  $upd.CommandText = "UPDATE _metadati__tabelle SET mdedittemplate = @t WHERE mdroutename = @r"
  [void]$upd.Parameters.AddWithValue('@t', $cfg.template)
  [void]$upd.Parameters.AddWithValue('@r', $cfg.route)
  $rows = $upd.ExecuteNonQuery()
  Write-Host "[$($cfg.route)] template applicato (rows=$rows)"
}

# Verifica finale
Write-Host "`n=== Verifica finale ==="
$verify = $conn.CreateCommand()
$verify.CommandText = "SELECT mdroutename, CASE WHEN CAST(mdedittemplate AS NVARCHAR(MAX)) LIKE N'%app-document-edit-form%' THEN 'YES' ELSE 'NO' END FROM _metadati__tabelle WHERE mdroutename IN ('fatture_inviate','fatture_ricevute','preventivi','ordini','ddt','ordini_acquisto','ordini_elettronici','proforma') ORDER BY mdroutename"
$reader = $verify.ExecuteReader()
while ($reader.Read()) { Write-Host "  $($reader[0]): $($reader[1])" }
$reader.Close()

$conn.Close()
Write-Host "`nDone."
