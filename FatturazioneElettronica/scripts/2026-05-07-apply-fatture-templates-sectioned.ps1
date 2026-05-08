#requires -Version 7.0
<#
  Genera md_edit_template + md_detail_template SECTIONED per fatture_inviate e
  fatture_ricevute. Le altre 19 route restano col template default (script
  2026-05-07-apply-form-templates.ps1).

  Layout HTML generato:

    <form ...>
      <fieldset class="wuic-form-section" ...>
        <legend ...>Identificativo documento</legend>
        <div class="row g-3">
          <div class="col-lg-6 col-md-6 mb-2"><ng-container *ngIf="getMetaColumn('numero') ...">...</ng-container></div>
          ...
        </div>
      </fieldset>
      <fieldset ...>
        <legend>Cliente e pagamento</legend>
        ...
      </fieldset>
      ...
      <fieldset ...>
        <legend>Altri campi</legend>
        ... (catch-all: campi non mappati esplicitamente in alcuna sezione)
      </fieldset>
    </form>

  Sezioni hardcoded sotto. I campi che non sono in nessuna sezione vanno in "Altri campi" (catch-all). Filtri colonne identici al suggest framework:
    edit:   mc_is_primary_key=0 AND mc_db_column_type NOT IN ('binary','varbinary') AND ISNULL(mchideinedit,0)=0
    detail: mc_is_primary_key=0 AND mc_db_column_type NOT IN ('binary','varbinary') AND ISNULL(mchideindetail,0)=0
  Idempotente: solo UPDATE.
#>
[CmdletBinding()]
param(
  [string]$Server   = 'localhost\sqlexpress',
  [string]$Database = 'FatturazioneElettronica_Metadata',
  [string[]]$Routes = @(
    'fatture_inviate','fatture_ricevute',
    'clienti','fornitori','prodotti','banche','codici_iva','pagamenti','vw_anagrafica_unificata',
    'preventivi','ordini','ordini_elettronici','ddt','proforma','ordini_acquisto',
    'email_log','email_template','prima_nota','corrispettivi','movimenti_bancari'
  ),
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName 'System.Data'

$connStr = "Server=$Server;Database=$Database;Integrated Security=True;TrustServerCertificate=True;"

# ---------------------------------------------------------------------------
# Mapping sezioni hardcoded: <route> -> [@{ Title=...; Cols=@(...) }, ...]
# ---------------------------------------------------------------------------
$Sections = @{
  # ----- Documenti -----
  'fatture_inviate' = @(
    @{ Title = 'Identificativo documento';  Cols = @('numero','serie','progressivo','anno','data_documento') }
    @{ Title = 'Cliente e pagamento';       Cols = @('cliente_id','pagamento_id','banca_id','causale','riferimento_ordine') }
    # Master-detail: nested grid righe fattura (tabella fatture_inviate_righe)
    @{ Title = 'Righe';                     Type = 'nested'; NestedIndex = 0 }
    @{ Title = 'Importi';                   Cols = @('bollo_valore','sconto_globale_perc','imponibile','iva','totale') }
    # Master-detail: nested grid scadenze (tabella scadenze, fk fattura_inviata_id)
    @{ Title = 'Scadenze';                  Type = 'nested'; NestedIndex = 1 }
    @{ Title = 'Stato e SDI';               Cols = @('stato','stato_sdi','sdi_id','sdi_messaggio','file_xml') }
    @{ Title = 'Note';                      Cols = @('note') }
    @{ Title = 'Audit';                     Cols = @('cancellato','data_creazione','data_modifica','utente_creazione','utente_modifica') }
  )
  'fatture_ricevute' = @(
    @{ Title = 'Identificativo documento';  Cols = @('numero_fornitore','progressivo_interno','anno','data_documento','data_ricezione') }
    @{ Title = 'Fornitore e pagamento';     Cols = @('fornitore_id','pagamento_id','causale') }
    @{ Title = 'Importi';                   Cols = @('imponibile','iva','iva_indetraibile','totale') }
    @{ Title = 'Stato e SDI';               Cols = @('stato','stato_sdi','file_xml') }
    @{ Title = 'Note';                      Cols = @('note') }
    @{ Title = 'Audit';                     Cols = @('cancellato','data_creazione','data_modifica') }
  )
  'email_log' = @(
    @{ Title = 'Destinatari';   Cols = @('recipient_to','recipient_cc') }
    @{ Title = 'Contenuto';     Cols = @('subject','body','attachment_paths') }
    @{ Title = 'Riferimenti';   Cols = @('fattura_id') }
    @{ Title = 'Spedizione';    Cols = @('status','smtp_response','sent_at') }
    @{ Title = 'Audit';         Cols = @('created_at','utente_creazione') }
  )
  'email_template' = @(
    @{ Title = 'Identificativo'; Cols = @('codice','descrizione','categoria') }
    @{ Title = 'Contenuto';      Cols = @('oggetto') }
    @{ Title = 'Stato';          Cols = @('attivo') }
    @{ Title = 'Audit';          Cols = @('data_creazione','data_modifica') }
  )

  # ----- Anagrafiche -----
  'clienti' = @(
    @{ Title = 'Anagrafica';            Cols = @('codice','ragione_sociale','tipo_soggetto') }
    @{ Title = 'Identificativo fiscale';Cols = @('partita_iva','codice_fiscale') }
    @{ Title = 'Indirizzo';             Cols = @('indirizzo','cap','citta','provincia','nazione') }
    @{ Title = 'Contatti';              Cols = @('pec','email','telefono','sito_web','codice_destinatario') }
    @{ Title = 'Commerciale';           Cols = @('pagamento_default','sconto_default','fido') }
    @{ Title = 'Note e stato';          Cols = @('note','attivo') }
    @{ Title = 'Audit';                 Cols = @('cancellato','data_creazione','data_modifica') }
  )
  'fornitori' = @(
    @{ Title = 'Anagrafica';            Cols = @('codice','ragione_sociale','tipo_soggetto') }
    @{ Title = 'Identificativo fiscale';Cols = @('partita_iva','codice_fiscale') }
    @{ Title = 'Indirizzo';             Cols = @('indirizzo','cap','citta','provincia','nazione') }
    @{ Title = 'Contatti';              Cols = @('pec','email','telefono','sito_web','codice_destinatario') }
    @{ Title = 'Commerciale';           Cols = @('iban','pagamento_default') }
    @{ Title = 'Note e stato';          Cols = @('note','attivo') }
    @{ Title = 'Audit';                 Cols = @('cancellato','data_creazione','data_modifica') }
  )
  'prodotti' = @(
    @{ Title = 'Anagrafica';      Cols = @('codice','descrizione','tipo','categoria') }
    @{ Title = 'Unita e IVA';     Cols = @('unita_misura_id','codice_iva_id') }
    @{ Title = 'Prezzi';          Cols = @('prezzo_vendita','prezzo_acquisto','sconto_default') }
    @{ Title = 'Note e stato';    Cols = @('note','attivo') }
    @{ Title = 'Audit';           Cols = @('cancellato','data_creazione','data_modifica') }
  )
  'banche' = @(
    @{ Title = 'Identificativo'; Cols = @('nome_banca','descrizione','intestatario') }
    @{ Title = 'Coordinate';     Cols = @('iban','bic_swift','abi','cab') }
    @{ Title = 'Importi';        Cols = @('saldo_iniziale','valuta') }
    @{ Title = 'Stato';          Cols = @('predefinita','attivo') }
    @{ Title = 'Note';           Cols = @('note') }
    @{ Title = 'Audit';          Cols = @('cancellato','data_creazione') }
  )
  'codici_iva' = @(
    @{ Title = 'Anagrafica';      Cols = @('codice','descrizione','aliquota') }
    @{ Title = 'SDI';             Cols = @('natura_sdi') }
    @{ Title = 'Indetraibilita';  Cols = @('indetraibile','perc_indetraib') }
    @{ Title = 'Note e stato';    Cols = @('note','attivo') }
    @{ Title = 'Audit';           Cols = @('cancellato','data_creazione','data_modifica') }
  )
  'pagamenti' = @(
    @{ Title = 'Anagrafica';   Cols = @('codice_sdi','descrizione') }
    @{ Title = 'Scadenze';     Cols = @('giorni_scadenza','tipo_scadenza','n_rate') }
    @{ Title = 'Note e stato'; Cols = @('note','attivo') }
    @{ Title = 'Audit';        Cols = @('cancellato','data_creazione') }
  )
  'vw_anagrafica_unificata' = @(
    @{ Title = 'Anagrafica';            Cols = @('tipo','codice_cliente','codice_fornitore','ragione_sociale') }
    @{ Title = 'Identificativo fiscale';Cols = @('partita_iva','codice_fiscale','tipo_soggetto') }
    @{ Title = 'Indirizzo';             Cols = @('indirizzo','cap','citta','provincia','nazione') }
    @{ Title = 'Contatti';              Cols = @('pec','email','telefono') }
  )

  # ----- Vendite -----
  'preventivi' = @(
    @{ Title = 'Identificativo'; Cols = @('numero','progressivo','anno','data_documento','data_validita') }
    @{ Title = 'Cliente';        Cols = @('cliente_id','oggetto') }
    @{ Title = 'Importi';        Cols = @('imponibile','iva','totale') }
    @{ Title = 'Stato';          Cols = @('stato') }
    @{ Title = 'Note';           Cols = @('note') }
    @{ Title = 'Audit';          Cols = @('cancellato','data_creazione','data_modifica') }
  )
  'ordini' = @(
    @{ Title = 'Identificativo'; Cols = @('numero','progressivo','anno','data_documento','data_consegna') }
    @{ Title = 'Cliente';        Cols = @('cliente_id','riferimento_cliente') }
    @{ Title = 'Importi';        Cols = @('imponibile','iva','totale') }
    @{ Title = 'Stato';          Cols = @('stato') }
    @{ Title = 'Note';           Cols = @('note') }
    @{ Title = 'Audit';          Cols = @('cancellato','data_creazione','data_modifica') }
  )
  'ordini_elettronici' = @(
    @{ Title = 'Identificativo'; Cols = @('numero_pa','progressivo_interno','anno','data_documento','data_ricezione') }
    @{ Title = 'Cliente';        Cols = @('cliente_id') }
    @{ Title = 'PA';             Cols = @('cig','cup','file_xml','nso_message_id') }
    @{ Title = 'Importi';        Cols = @('imponibile','iva','totale') }
    @{ Title = 'Stato';          Cols = @('stato') }
    @{ Title = 'Note';           Cols = @('note') }
    @{ Title = 'Audit';          Cols = @('cancellato','data_creazione') }
  )
  'ddt' = @(
    @{ Title = 'Identificativo'; Cols = @('numero','progressivo','anno','data_documento') }
    @{ Title = 'Cliente';        Cols = @('cliente_id') }
    @{ Title = 'Trasporto';      Cols = @('causale_trasporto','aspetto_beni','n_colli','peso_lordo','porto','vettore','data_ora_trasporto') }
    @{ Title = 'Stato e fattura';Cols = @('stato','fattura_id') }
    @{ Title = 'Note';           Cols = @('note') }
    @{ Title = 'Audit';          Cols = @('cancellato','data_creazione','data_modifica') }
  )
  'proforma' = @(
    @{ Title = 'Identificativo'; Cols = @('numero','progressivo','anno','data_documento') }
    @{ Title = 'Cliente';        Cols = @('cliente_id') }
    @{ Title = 'Importi';        Cols = @('imponibile','iva','totale') }
    @{ Title = 'Stato e fattura';Cols = @('stato','fattura_id') }
    @{ Title = 'Note';           Cols = @('note') }
    @{ Title = 'Audit';          Cols = @('cancellato','data_creazione','data_modifica') }
  )

  # ----- Acquisti -----
  'ordini_acquisto' = @(
    @{ Title = 'Identificativo'; Cols = @('numero','progressivo','anno','data_documento','data_consegna') }
    @{ Title = 'Fornitore';      Cols = @('fornitore_id','riferimento') }
    @{ Title = 'Importi';        Cols = @('imponibile','iva','totale') }
    @{ Title = 'Stato';          Cols = @('stato') }
    @{ Title = 'Note';           Cols = @('note') }
    @{ Title = 'Audit';          Cols = @('cancellato','data_creazione','data_modifica') }
  )

  # ----- Finanze -----
  'prima_nota' = @(
    @{ Title = 'Movimento';   Cols = @('data_movimento','tipo','importo') }
    @{ Title = 'Causale';     Cols = @('causale','descrizione','riferimento_doc') }
    @{ Title = 'Controparte'; Cols = @('cliente_id','fornitore_id','banca_id') }
    @{ Title = 'Riferimenti'; Cols = @('fattura_inviata_id','fattura_ricevuta_id','scadenza_id') }
    @{ Title = 'Note';        Cols = @('note') }
    @{ Title = 'Audit';       Cols = @('data_creazione','data_modifica') }
  )
  'corrispettivi' = @(
    @{ Title = 'Identificativo'; Cols = @('data_giorno','progressivo') }
    @{ Title = 'Movimento';      Cols = @('descrizione') }
    @{ Title = 'Importi';        Cols = @('imponibile','iva','totale') }
    @{ Title = 'IVA e pagamento';Cols = @('codice_iva_id','metodo_pagamento') }
    @{ Title = 'Note';           Cols = @('note') }
    @{ Title = 'Audit';          Cols = @('cancellato','data_creazione','data_modifica') }
  )
  'movimenti_bancari' = @(
    @{ Title = 'Operazione';     Cols = @('banca_id','data_operazione','data_valuta','importo') }
    @{ Title = 'Causale';        Cols = @('causale','descrizione','riferimento') }
    @{ Title = 'Controparte';    Cols = @('iban_controparte','nome_controparte') }
    @{ Title = 'Riconciliazione';Cols = @('scadenza_id','match_score','match_status') }
    @{ Title = 'Import';         Cols = @('import_batch_id','created_at') }
  )
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Get-RouteCols {
  param($conn, [string]$route, [string]$mode)
  $hideCol = if ($mode -eq 'edit') { 'mchideinedit' } else { 'mchideindetail' }
  $sql = @"
SELECT c.mc_nome_colonna AS colname
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.mdroutename = @route
   AND ISNULL(c.mc_is_primary_key, 0) = 0
   AND ISNULL(c.mc_db_column_type, '') NOT IN ('binary','varbinary')
   AND ISNULL(c.$hideCol, 0) = 0
 ORDER BY c.mcordine ASC, c.mc_id ASC;
"@
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $sql
  [void]$cmd.Parameters.AddWithValue('@route', $route)
  $r = $cmd.ExecuteReader()
  $cols = @()
  while ($r.Read()) { $cols += $r['colname'] }
  $r.Close()
  return $cols
}

function Add-FieldEditor {
  param([System.Text.StringBuilder]$sb, [string]$col, [bool]$readOnly)
  $f = ($col -replace "'", "\'")
  $ro = if ($readOnly) { 'true' } else { 'false' }
  [void]$sb.AppendLine('<div class="col-lg-6 col-md-6 mb-2">')
  [void]$sb.AppendLine("<ng-container *ngIf=`"getMetaColumn('$f') as editField`">")
  [void]$sb.AppendLine("<wuic-field-editor [record]=`"record`" [field]=`"editField`" [metaInfo]=`"metaInfo`" [readOnly]=`"$ro`" [forceShowLabel]=`"true`"></wuic-field-editor>")
  [void]$sb.AppendLine('</ng-container>')
  [void]$sb.AppendLine('</div>')
}

function Build-SectionedTemplate {
  param([string[]]$availableCols, [array]$sections, [bool]$readOnly)

  # Replica il pattern <p-tabs>/<p-tablist>/<p-tabpanel> del default
  # parametric-dialog (parametric-dialog.component.html linee 6-26 quando
  # md_tab_edit=true) ma con tab hardcoded invece di metadata.dataTabs.
  # Vantaggio: niente scrolling verticale del form intero, ogni tab mostra
  # solo i campi della sua sezione e <p-tabpanels> fa lo scroll interno se
  # un singolo tab eccede.
  #
  # Una sezione puo' essere di 2 tipi:
  #   - normale: { Title, Cols=@(...) } -> tab con campi <wuic-field-editor>
  #   - nested:  { Title, Type='nested', NestedIndex=0|1|... } -> tab con
  #     <wuic-data-source>+<wuic-data-repeater> per la N-esima nested route
  #     definita in metaInfo.nestedRoutes (parsata da md_nested_grid_routes).

  $available = [System.Collections.Generic.HashSet[string]]::new([string[]]$availableCols, [System.StringComparer]::OrdinalIgnoreCase)
  $used      = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

  # Pre-filtra solo le sezioni con almeno 1 campo disponibile (o nested)
  $renderSections = @()
  foreach ($sec in $sections) {
    $type = if ($sec.Type) { [string]$sec.Type } else { 'fields' }
    if ($type -eq 'nested') {
      $renderSections += [PSCustomObject]@{ Title = $sec.Title; Type = 'nested'; NestedIndex = [int]$sec.NestedIndex }
      continue
    }
    $cols = @($sec.Cols | Where-Object { $available.Contains($_) })
    if ($cols.Count -gt 0) {
      $renderSections += [PSCustomObject]@{ Title = $sec.Title; Type = 'fields'; Cols = $cols }
      foreach ($c in $cols) { [void]$used.Add($c) }
    }
  }
  # Catch-all
  $orphans = @($availableCols | Where-Object { -not $used.Contains($_) })
  if ($orphans.Count -gt 0) {
    $renderSections += [PSCustomObject]@{ Title = 'Altri campi'; Type = 'fields'; Cols = $orphans }
  }

  # Layout flex:1 1 auto sul <form>/<p-tabs>: il <form> riempie il
  # .form-edit-wrapper (che ha 'flex: 1 1 auto; max-height:100%' nel
  # parametric-dialog.scss), evitando spazio vuoto fra il tab e la toolbar
  # save/reset/cancel. Il tab attivo eredita 'height: 100%' dalle regole
  # CSS di styles.scss per .edit-form-content .p-tabpanel (overflow-y:auto).
  $sb = [System.Text.StringBuilder]::new()
  [void]$sb.AppendLine('<form novalidate style="flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; padding: 0; overflow: hidden; box-sizing: border-box;">')
  [void]$sb.AppendLine('<p-tabs value="tab0" style="flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0;">')

  # Tablist: header
  [void]$sb.AppendLine('<p-tablist>')
  for ($i = 0; $i -lt $renderSections.Count; $i++) {
    [void]$sb.AppendLine("<p-tab value=`"tab$i`">$($renderSections[$i].Title)</p-tab>")
  }
  [void]$sb.AppendLine('</p-tablist>')

  # Tabpanels: stretch flex; lo scroll del singolo tab eredita da .p-tabpanel
  [void]$sb.AppendLine('<p-tabpanels style="flex: 1 1 auto; min-height: 0; padding: 1rem 1.25rem 0.75rem 1.25rem;">')
  for ($i = 0; $i -lt $renderSections.Count; $i++) {
    $sec = $renderSections[$i]
    [void]$sb.AppendLine("<p-tabpanel value=`"tab$i`">")
    if ($sec.Type -eq 'nested') {
      # Master-detail tab: monta data-source + data-repeater list su nestedRoutes[N]
      $idx = $sec.NestedIndex
      $dsRef = "nestedDs$idx"
      [void]$sb.AppendLine('<div style="height: 100%; display: flex; flex-direction: column; min-height: 0;">')
      [void]$sb.AppendLine("<wuic-data-source #${dsRef} [autoload]=`"true`" [routeFromRouting]=`"false`" [hardcodedRoute]=`"metaInfo?.nestedRoutes && metaInfo.nestedRoutes[$idx] ? metaInfo.nestedRoutes[$idx].route : ''`" [parentRecord]=`"record`" [parentMetaInfo]=`"metaInfo`"></wuic-data-source>")
      [void]$sb.AppendLine("<wuic-data-repeater [hardcodedAction]=`"'list'`" [hardcodedDatasource]=`"${dsRef}`" style=`"flex:1 1 auto; min-height:0; display:block;`"></wuic-data-repeater>")
      [void]$sb.AppendLine('</div>')
    }
    else {
      [void]$sb.AppendLine('<div class="row g-3">')
      foreach ($c in $sec.Cols) { Add-FieldEditor -sb $sb -col $c -readOnly $readOnly }
      [void]$sb.AppendLine('</div>')
    }
    [void]$sb.AppendLine('</p-tabpanel>')
  }
  [void]$sb.AppendLine('</p-tabpanels>')

  [void]$sb.AppendLine('</p-tabs>')
  [void]$sb.AppendLine('</form>')
  return $sb.ToString()
}

function Set-RouteSectionedTemplates {
  param($conn, [string]$route)
  $sections = $Sections[$route]
  if ($null -eq $sections) {
    Write-Host "[$route] no section mapping defined, skipping"
    return
  }

  $editCols   = Get-RouteCols -conn $conn -route $route -mode 'edit'
  $detailCols = Get-RouteCols -conn $conn -route $route -mode 'detail'

  $editTpl   = Build-SectionedTemplate -availableCols $editCols   -sections $sections -readOnly $false
  $detailTpl = Build-SectionedTemplate -availableCols $detailCols -sections $sections -readOnly $true

  Write-Host ("[$route] edit cols={0} detail cols={1} sections={2} edit_len={3} detail_len={4}" -f `
    $editCols.Count, $detailCols.Count, $sections.Count, $editTpl.Length, $detailTpl.Length)

  if ($WhatIf) { return }

  $cmd = $conn.CreateCommand()
  $cmd.CommandText = @'
UPDATE _metadati__tabelle
   SET mdedittemplate   = @edit,
       mddetailtemplate = @detail
 WHERE mdroutename = @route;
'@
  [void]$cmd.Parameters.AddWithValue('@edit',   $editTpl)
  [void]$cmd.Parameters.AddWithValue('@detail', $detailTpl)
  [void]$cmd.Parameters.AddWithValue('@route',  $route)
  $rows = $cmd.ExecuteNonQuery()
  Write-Host ("[$route] UPDATE rows={0}" -f $rows)
}

$conn = [System.Data.SqlClient.SqlConnection]::new($connStr)
try {
  $conn.Open()
  foreach ($r in $Routes) { Set-RouteSectionedTemplates -conn $conn -route $r }
}
finally {
  $conn.Close()
  $conn.Dispose()
}
