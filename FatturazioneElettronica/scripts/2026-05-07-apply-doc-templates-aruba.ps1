#requires -Version 7.0
<#
  Genera md_edit_template + md_detail_template Aruba-style per le 4 master
  documenti commerciali: fatture_inviate / fatture_ricevute / preventivi /
  ordini.

  Layout (full-form, no <p-tabs>):
    Riga 1: 2 fieldset affiancati (Dati documento | Dati cliente/fornitore)
    Riga 2: fieldset full-width "Prodotti e servizi" con
            <wuic-data-source>+<wuic-data-repeater> action='list' che,
            grazie a md_inline_edit=1 + md_batch_save=1 sulle righe-tabelle,
            permette editing inline a la Aruba.
    Riga 3: 2 fieldset affiancati (Dati pagamento | Calcolo)
    Riga 4 (solo fatture_inviate): fieldset full-width Stato e SDI
    Riga 5 (solo fatture_inviate): fieldset full-width Scadenze (nested 1)

  Idempotente: solo UPDATE su mdedittemplate/mddetailtemplate.
#>
[CmdletBinding()]
param(
  [string]$Server   = 'localhost\sqlexpress',
  [string]$Database = 'FatturazioneElettronica_Metadata',
  [string[]]$Routes = @('fatture_inviate','fatture_ricevute','preventivi','ordini'),
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName 'System.Data'

$connStr = "Server=$Server;Database=$Database;Integrated Security=True;TrustServerCertificate=True;"

# ---------------------------------------------------------------------------
# Layout per route. Ogni Row e' o un blocco "cards" (1 o 2 card affiancate)
# o un blocco "nested" (full-width grid righe).
# ---------------------------------------------------------------------------
$DocLayouts = @{
  'fatture_inviate' = @(
    @{ Type='cards'; Cards=@(
        @{ Title='Dati documento'; Cols=@('numero','serie','progressivo','anno','data_documento') }
        @{ Title='Dati cliente';   Cols=@('cliente_id','causale','riferimento_ordine') }
    )}
    @{ Type='nested'; Title='Prodotti e servizi'; NestedIndex=0 }
    @{ Type='cards'; Cards=@(
        @{ Title='Dati pagamento';  Cols=@('pagamento_id','banca_id') }
        @{ Title='Calcolo fattura'; Cols=@('imponibile','iva','bollo_valore','sconto_globale_perc','totale') }
    )}
    @{ Type='cards'; Cards=@(
        @{ Title='Stato e SDI'; Cols=@('stato','stato_sdi','sdi_id','sdi_messaggio') }
    )}
    @{ Type='nested'; Title='Scadenze'; NestedIndex=1 }
    @{ Type='cards'; Cards=@(
        @{ Title='Note'; Cols=@('note') }
    )}
  )
  'fatture_ricevute' = @(
    @{ Type='cards'; Cards=@(
        @{ Title='Dati documento';  Cols=@('numero_fornitore','progressivo_interno','anno','data_documento','data_ricezione') }
        @{ Title='Dati fornitore';  Cols=@('fornitore_id','causale') }
    )}
    @{ Type='nested'; Title='Prodotti e servizi'; NestedIndex=0 }
    @{ Type='cards'; Cards=@(
        @{ Title='Dati pagamento';  Cols=@('pagamento_id') }
        @{ Title='Calcolo fattura'; Cols=@('imponibile','iva','iva_indetraibile','totale') }
    )}
    @{ Type='cards'; Cards=@(
        @{ Title='Stato e SDI'; Cols=@('stato','stato_sdi') }
    )}
    @{ Type='cards'; Cards=@(
        @{ Title='Note'; Cols=@('note') }
    )}
  )
  'preventivi' = @(
    @{ Type='cards'; Cards=@(
        @{ Title='Dati documento'; Cols=@('numero','progressivo','anno','data_documento','data_validita') }
        @{ Title='Dati cliente';   Cols=@('cliente_id','oggetto') }
    )}
    @{ Type='nested'; Title='Prodotti e servizi'; NestedIndex=0 }
    @{ Type='cards'; Cards=@(
        @{ Title='Stato';   Cols=@('stato') }
        @{ Title='Calcolo'; Cols=@('imponibile','iva','totale') }
    )}
    @{ Type='cards'; Cards=@(
        @{ Title='Note'; Cols=@('note') }
    )}
  )
  'ordini' = @(
    @{ Type='cards'; Cards=@(
        @{ Title='Dati documento'; Cols=@('numero','progressivo','anno','data_documento','data_consegna') }
        @{ Title='Dati cliente';   Cols=@('cliente_id','riferimento_cliente') }
    )}
    @{ Type='nested'; Title='Prodotti e servizi'; NestedIndex=0 }
    @{ Type='cards'; Cards=@(
        @{ Title='Stato';   Cols=@('stato') }
        @{ Title='Calcolo'; Cols=@('imponibile','iva','totale') }
    )}
    @{ Type='cards'; Cards=@(
        @{ Title='Note'; Cols=@('note') }
    )}
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
  param([System.Text.StringBuilder]$sb, [string]$col, [bool]$readOnly, [string]$colSize='col-lg-6 col-md-12')
  $f  = ($col -replace "'", "\'")
  $ro = if ($readOnly) { 'true' } else { 'false' }
  [void]$sb.AppendLine("<div class=`"$colSize mb-2`">")
  [void]$sb.AppendLine("<ng-container *ngIf=`"getMetaColumn('$f') as editField`">")
  [void]$sb.AppendLine("<wuic-field-editor [record]=`"record`" [field]=`"editField`" [metaInfo]=`"metaInfo`" [readOnly]=`"$ro`" [forceShowLabel]=`"true`"></wuic-field-editor>")
  [void]$sb.AppendLine('</ng-container>')
  [void]$sb.AppendLine('</div>')
}

function Add-Fieldset {
  param([System.Text.StringBuilder]$sb, [string]$title, [scriptblock]$body)
  [void]$sb.AppendLine('<fieldset style="border:1px solid #e3e8ef; border-radius:8px; padding:0.75rem 1.25rem 0.5rem 1.25rem; height:100%;">')
  [void]$sb.AppendLine("<legend style=`"font-size:0.92rem; font-weight:600; color:#334155; padding:0 0.5rem; width:auto; margin-bottom:0;`">$title</legend>")
  & $body
  [void]$sb.AppendLine('</fieldset>')
}

function Build-DocTemplate {
  param([string[]]$availableCols, [array]$layout, [bool]$readOnly)

  $available = [System.Collections.Generic.HashSet[string]]::new([string[]]$availableCols, [System.StringComparer]::OrdinalIgnoreCase)

  $sb = [System.Text.StringBuilder]::new()
  [void]$sb.AppendLine('<form novalidate style="flex:1 1 auto; display:flex; flex-direction:column; min-height:0; padding:0; overflow:hidden; box-sizing:border-box;">')
  [void]$sb.AppendLine('<div style="flex:1 1 auto; min-height:0; overflow:auto; padding:1.25rem 1.5rem 1rem 1.5rem;">')

  foreach ($row in $layout) {
    if ($row.Type -eq 'nested') {
      $idx = [int]$row.NestedIndex
      $title = [string]$row.Title
      $dsRef = "nestedDs$idx"
      [void]$sb.AppendLine('<div class="row g-3" style="margin-bottom:1rem;">')
      [void]$sb.AppendLine('<div class="col-12">')
      Add-Fieldset -sb $sb -title $title -body {
        [void]$sb.AppendLine('<div style="display:flex; flex-direction:column; min-height:0;">')
        [void]$sb.AppendLine("<wuic-data-source #${dsRef} [autoload]=`"true`" [routeFromRouting]=`"false`" [hardcodedRoute]=`"metaInfo?.nestedRoutes && metaInfo.nestedRoutes[$idx] ? metaInfo.nestedRoutes[$idx].route : ''`" [parentRecord]=`"record`" [parentMetaInfo]=`"metaInfo`"></wuic-data-source>")
        [void]$sb.AppendLine("<wuic-data-repeater [hardcodedAction]=`"'list'`" [hardcodedDatasource]=`"${dsRef}`" style=`"display:block; min-height:280px;`"></wuic-data-repeater>")
        [void]$sb.AppendLine('</div>')
      }
      [void]$sb.AppendLine('</div>')
      [void]$sb.AppendLine('</div>')
    }
    elseif ($row.Type -eq 'cards') {
      $cards = @($row.Cards)
      $cardCount = $cards.Count
      $colCls = switch ($cardCount) {
        1 { 'col-12' }
        2 { 'col-lg-6 col-md-12' }
        default { 'col-lg-6 col-md-12' }
      }
      [void]$sb.AppendLine('<div class="row g-3" style="margin-bottom:1rem;">')
      foreach ($card in $cards) {
        $cardCols = @($card.Cols | Where-Object { $available.Contains($_) })
        if ($cardCols.Count -eq 0) { continue }
        [void]$sb.AppendLine("<div class=`"$colCls`">")
        Add-Fieldset -sb $sb -title $card.Title -body {
          [void]$sb.AppendLine('<div class="row g-3">')
          # Per "Note" il campo da solo va full-width
          $innerColSize = if ($card.Title -eq 'Note' -or $cardCols.Count -eq 1) { 'col-12' } else { 'col-lg-6 col-md-12' }
          foreach ($c in $cardCols) {
            Add-FieldEditor -sb $sb -col $c -readOnly $readOnly -colSize $innerColSize
          }
          [void]$sb.AppendLine('</div>')
        }
        [void]$sb.AppendLine('</div>')
      }
      [void]$sb.AppendLine('</div>')
    }
  }

  [void]$sb.AppendLine('</div>')
  [void]$sb.AppendLine('</form>')
  return $sb.ToString()
}

function Set-RouteDocTemplates {
  param($conn, [string]$route)
  $layout = $DocLayouts[$route]
  if ($null -eq $layout) {
    Write-Host "[$route] no layout defined, skipping"
    return
  }

  $editCols   = Get-RouteCols -conn $conn -route $route -mode 'edit'
  $detailCols = Get-RouteCols -conn $conn -route $route -mode 'detail'

  $editTpl   = Build-DocTemplate -availableCols $editCols   -layout $layout -readOnly $false
  $detailTpl = Build-DocTemplate -availableCols $detailCols -layout $layout -readOnly $true

  Write-Host ("[$route] edit_cols={0} detail_cols={1} layout_rows={2} edit_len={3} detail_len={4}" -f `
    $editCols.Count, $detailCols.Count, $layout.Count, $editTpl.Length, $detailTpl.Length)

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
  foreach ($r in $Routes) { Set-RouteDocTemplates -conn $conn -route $r }
}
finally {
  $conn.Close()
  $conn.Dispose()
}
