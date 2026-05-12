# Diff REALE campo-per-campo: per ogni system route, dump SELECT * cross-DB
# tramite SqlClient (no line-break artifacts come sqlcmd) e confronta TUTTE le
# properties cella-per-cella, sia per `_metadati__colonne` che per `_metadati__tabelle`.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data

$systemRoutes = @(
  ' metadati  tabelle',
  ' metadati  colonne',
  ' metadati  menu',
  ' metadati  wizard',
  ' metadati  wizard  tabelle',
  ' metadati  tabelle_cloned',
  ' metadati  colonne_cloned',
  '__metadati_stili_colonna',
  '__metadati_stili_tabella',
  '_metadati_condition_action_group',
  '_metadati_condition_action_item',
  '_metadati_condition_group',
  '_metadati_condition_item'
)

# Properties da ignorare (variano per-DB legitimamente)
$skip = @{ 'mc_id' = $true; 'md_id' = $true }

function Get-Rows {
  param([string]$Db, [string]$Route)
  $cs = "Data Source=localhost\sqlexpress;Initial Catalog=$Db;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True"
  $conn = New-Object System.Data.SqlClient.SqlConnection $cs
  $conn.Open()
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = "SELECT c.* FROM dbo._metadati__colonne c JOIN dbo._metadati__tabelle t ON t.md_id=c.md_id WHERE t.mdroutename = @r ORDER BY c.mc_nome_colonna"
  [void]$cmd.Parameters.AddWithValue('@r', $Route)
  $rdr = $cmd.ExecuteReader()
  $rows = @()
  while ($rdr.Read()) {
    $row = @{}
    for ($i = 0; $i -lt $rdr.FieldCount; $i++) {
      $name = $rdr.GetName($i)
      $val = if ($rdr.IsDBNull($i)) { $null } else { $rdr.GetValue($i) }
      $row[$name] = $val
    }
    $rows += $row
  }
  $rdr.Close()
  $conn.Close()
  return $rows
}

$diffs = New-Object System.Collections.ArrayList
foreach ($route in $systemRoutes) {
  $kRows = @{}; (Get-Rows -Db 'Kiara_wuic_new' -Route $route)             | ForEach-Object { $kRows[$_.mc_nome_colonna] = $_ }
  $fRows = @{}; (Get-Rows -Db 'FatturazioneElettronica_Metadata' -Route $route) | ForEach-Object { $fRows[$_.mc_nome_colonna] = $_ }
  if ($kRows.Count -eq 0 -or $fRows.Count -eq 0) { continue }

  $allCols = New-Object System.Collections.Generic.HashSet[string]
  $kRows.Keys | ForEach-Object { [void]$allCols.Add($_) }
  $fRows.Keys | ForEach-Object { [void]$allCols.Add($_) }

  foreach ($colName in $allCols) {
    $k = $kRows[$colName]
    $f = $fRows[$colName]
    if (-not $k) { [void]$diffs.Add(@{ route=$route; col=$colName; prop='__only_in_fe' }); continue }
    if (-not $f) { [void]$diffs.Add(@{ route=$route; col=$colName; prop='__only_in_kiara' }); continue }

    $allProps = New-Object System.Collections.Generic.HashSet[string]
    $k.Keys | ForEach-Object { [void]$allProps.Add($_) }
    $f.Keys | ForEach-Object { [void]$allProps.Add($_) }

    foreach ($p in $allProps) {
      if ($skip.ContainsKey($p)) { continue }
      $vk = $k[$p]
      $vf = $f[$p]
      # normalize: null/empty/whitespace
      if ($vk -is [string] -and [string]::IsNullOrWhiteSpace($vk)) { $vk = $null }
      if ($vf -is [string] -and [string]::IsNullOrWhiteSpace($vf)) { $vf = $null }
      $eq = if ($null -eq $vk -and $null -eq $vf) { $true }
            elseif ($null -eq $vk -or $null -eq $vf) { $false }
            else { $vk.ToString() -eq $vf.ToString() }
      if (-not $eq) {
        [void]$diffs.Add(@{ route=$route; col=$colName; prop=$p; kiara=$vk; fe=$vf })
      }
    }
  }
}

Write-Host "Total diffs: $($diffs.Count)"
$byProp = $diffs | Group-Object { $_.prop } | Sort-Object Count -Descending
Write-Host ""
Write-Host "Diffs by property:"
$byProp | ForEach-Object {
  Write-Host ("  {0,4}  {1}" -f $_.Count, $_.Name)
}

$diffs | ConvertTo-Json -Depth 5 -Compress | Set-Content -Encoding UTF8 'C:\src\Wuic\FlottaMezzi\scripts\_real_diff_full.json'
Write-Host ""
Write-Host "Full report: C:\src\Wuic\FlottaMezzi\scripts\_real_diff_full.json"
