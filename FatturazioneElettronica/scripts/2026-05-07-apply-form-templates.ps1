#requires -Version 7.0
<#
  Applica md_edit_template + md_detail_template sulle route specificate, replicando
  il pattern del suggest framework (MetaService.suggestEditTemplate ->
  _Metadati_suggestions.BuildAngularEditTemplate / BuildAngularDetailTemplate):

    <form novalidate style="height: calc(100% - 50px);">
    <div class="row" style="overflow: auto; height: 100%;">
      <div class="col-lg-6 col-md-6">
        <ng-container *ngIf="getMetaColumn('<col>') as editField">
          <wuic-field-editor [record]="record" [field]="editField" [metaInfo]="metaInfo"
                             [readOnly]="<bool>" [forceShowLabel]="true"></wuic-field-editor>
        </ng-container>
      </div>
      ...
    </div>
    </form>

  Filtri colonne (identici al C#):
    edit:   mc_is_primary_key=0 AND mc_db_column_type NOT IN ('binary','varbinary') AND ISNULL(mchideinedit,0)=0
    detail: mc_is_primary_key=0 AND mc_db_column_type NOT IN ('binary','varbinary') AND ISNULL(mchideindetail,0)=0
  Ordine: mc_ordine ASC, mc_id ASC
  Idempotente: solo UPDATE.
#>
[CmdletBinding()]
param(
  [string]$Server   = 'localhost\sqlexpress',
  [string]$Database = 'FatturazioneElettronica_Metadata',
  [string[]]$Routes = @('fatture_inviate'),
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

# Carica System.Data.SqlClient
Add-Type -AssemblyName 'System.Data'

$connStr = "Server=$Server;Database=$Database;Integrated Security=True;TrustServerCertificate=True;"

function Get-RouteCols {
  param($conn, [string]$route, [string]$mode)
  # mode = 'edit' | 'detail'
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

function Build-Template {
  param([string[]]$cols, [bool]$readOnly)
  # Layout migliorato vs suggest framework default:
  #  - flex column che occupa lo spazio disponibile dal wrapper .form-edit-wrapper
  #    (NO height fisso 'calc(100% - 50px)', che faceva sforare il viewport e
  #    nascondeva la toolbar save/reset/cancel del parametric-dialog).
  #  - inner div con overflow:auto per lo scroll interno del contenuto.
  #  - padding interno per staccare campi dai bordi.
  #  - bootstrap g-3 (gutter 1rem) tra colonne; mb-2 (margin-bottom 0.5rem) sui col.
  $sb = [System.Text.StringBuilder]::new()
  [void]$sb.AppendLine('<form novalidate style="flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; padding: 0; overflow: hidden; box-sizing: border-box;">')
  [void]$sb.AppendLine('<div style="flex: 1 1 auto; min-height: 0; overflow: auto; padding: 1.25rem 1.5rem 1rem 1.5rem;">')
  [void]$sb.AppendLine('<div class="row g-3">')
  foreach ($c in $cols) {
    $f = ($c -replace "'", "\'")
    [void]$sb.AppendLine('<div class="col-lg-6 col-md-6 mb-2">')
    [void]$sb.AppendLine("<ng-container *ngIf=`"getMetaColumn('$f') as editField`">")
    $ro = if ($readOnly) { 'true' } else { 'false' }
    [void]$sb.AppendLine("<wuic-field-editor [record]=`"record`" [field]=`"editField`" [metaInfo]=`"metaInfo`" [readOnly]=`"$ro`" [forceShowLabel]=`"true`"></wuic-field-editor>")
    [void]$sb.AppendLine('</ng-container>')
    [void]$sb.AppendLine('</div>')
  }
  [void]$sb.AppendLine('</div>')
  [void]$sb.AppendLine('</div>')
  [void]$sb.AppendLine('</form>')
  return $sb.ToString()
}

function Set-RouteTemplates {
  param($conn, [string]$route)
  $editCols   = Get-RouteCols -conn $conn -route $route -mode 'edit'
  $detailCols = Get-RouteCols -conn $conn -route $route -mode 'detail'
  $editTpl   = Build-Template -cols $editCols   -readOnly $false
  $detailTpl = Build-Template -cols $detailCols -readOnly $true

  Write-Host ("[$route] edit cols={0} detail cols={1} edit_len={2} detail_len={3}" -f `
    $editCols.Count, $detailCols.Count, $editTpl.Length, $detailTpl.Length)

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
  foreach ($r in $Routes) { Set-RouteTemplates -conn $conn -route $r }
}
finally {
  $conn.Close()
  $conn.Dispose()
}
