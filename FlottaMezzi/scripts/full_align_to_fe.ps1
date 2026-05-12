# Allineamento totale: copia TUTTI i campi (eccetto PK identifier) da FE → target,
# per OGNI system route, sia su `_metadati__tabelle` (1 row) che su
# `_metadati__colonne` (~150 row per route).
#
# Genera dynamic SQL con SET multi-column, eseguito cross-DB in 1 UPDATE.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data

$source = 'FatturazioneElettronica_Metadata'
$targets = @('Kiara_wuic_new', 'FlottaMezzi_Metadata')

function Invoke-Scalar {
  param([string]$Db, [string]$Sql)
  $cs = "Data Source=localhost\sqlexpress;Initial Catalog=$Db;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True"
  $conn = New-Object System.Data.SqlClient.SqlConnection $cs
  $conn.Open()
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $Sql
  $cmd.CommandTimeout = 120
  try { return $cmd.ExecuteScalar() } finally { $conn.Close() }
}

function Invoke-NonQuery {
  param([string]$Db, [string]$Sql)
  $cs = "Data Source=localhost\sqlexpress;Initial Catalog=$Db;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True"
  $conn = New-Object System.Data.SqlClient.SqlConnection $cs
  $conn.Open()
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $Sql
  $cmd.CommandTimeout = 300
  try { return $cmd.ExecuteNonQuery() } finally { $conn.Close() }
}

function Get-AllColumns {
  param([string]$Db, [string]$Table)
  $cs = "Data Source=localhost\sqlexpress;Initial Catalog=$Db;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True"
  $conn = New-Object System.Data.SqlClient.SqlConnection $cs
  $conn.Open()
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@t AND TABLE_SCHEMA='dbo' ORDER BY ORDINAL_POSITION"
  [void]$cmd.Parameters.AddWithValue('@t', $Table)
  $rdr = $cmd.ExecuteReader()
  $cols = @()
  while ($rdr.Read()) { $cols += $rdr.GetString(0) }
  $rdr.Close(); $conn.Close()
  return $cols
}

# Identifier columns NEVER copy (surrogate PKs locali al DB)
$skipCols = @('mc_id','md_id')

# Build SET clause for _metadati__colonne (excluding PK identifiers)
$colsMC = (Get-AllColumns -Db $source -Table '_metadati__colonne') | Where-Object { $skipCols -notcontains $_ }
$setMC = ($colsMC | ForEach-Object { "tc.[$_] = sc.[$_]" }) -join ",`n  "

# Build SET clause for _metadati__tabelle
$colsMT = (Get-AllColumns -Db $source -Table '_metadati__tabelle') | Where-Object { $skipCols -notcontains $_ }
$setMT = ($colsMT | ForEach-Object { "tt.[$_] = st.[$_]" }) -join ",`n  "

# System routes pattern (anche _metadati_* e __metadati_*)
$routePattern = "tt.mdroutename LIKE '% metadati %' OR tt.mdroutename LIKE '_metadati%' OR tt.mdroutename LIKE '__metadati%'"

foreach ($target in $targets) {
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Cyan
  Write-Host "  Target: $target  ←  Source: $source" -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor Cyan

  # 1) Sync _metadati__tabelle rows for system routes (1 row each, joinato per mdroutename)
  $sqlMT = @"
UPDATE tt
SET
  $setMT
FROM [$target].dbo._metadati__tabelle tt
JOIN $source.dbo._metadati__tabelle st ON st.mdroutename = tt.mdroutename
WHERE tt.mdroutename LIKE '% metadati %' OR tt.mdroutename LIKE '_metadati%' OR tt.mdroutename LIKE '__metadati%'
"@
  $rowsMT = Invoke-NonQuery -Db $target -Sql $sqlMT
  Write-Host "  _metadati__tabelle synced rows: $rowsMT  (routes su system metadata)" -ForegroundColor Green

  # 2) Sync _metadati__colonne rows for system routes (joinato per mdroutename + mc_nome_colonna)
  $sqlMC = @"
UPDATE tc
SET
  $setMC
FROM [$target].dbo._metadati__colonne tc
JOIN [$target].dbo._metadati__tabelle tt ON tt.md_id = tc.md_id
JOIN $source.dbo._metadati__tabelle st ON st.mdroutename = tt.mdroutename
JOIN $source.dbo._metadati__colonne sc ON sc.md_id = st.md_id AND sc.mc_nome_colonna = tc.mc_nome_colonna
WHERE tt.mdroutename LIKE '% metadati %' OR tt.mdroutename LIKE '_metadati%' OR tt.mdroutename LIKE '__metadati%'
"@
  $rowsMC = Invoke-NonQuery -Db $target -Sql $sqlMC
  Write-Host "  _metadati__colonne synced rows: $rowsMC  (colonne FE-source matched per nome)" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sanity post-fix: residual diffs vs FE (5 critical properties) ==="
foreach ($target in $targets) {
  $sql = @"
SELECT COUNT(*) FROM [$target].dbo._metadati__colonne tc
JOIN [$target].dbo._metadati__tabelle tt ON tt.md_id=tc.md_id
JOIN $source.dbo._metadati__tabelle st ON st.mdroutename = tt.mdroutename
JOIN $source.dbo._metadati__colonne sc ON sc.md_id = st.md_id AND sc.mc_nome_colonna = tc.mc_nome_colonna
WHERE (tt.mdroutename LIKE '% metadati %' OR tt.mdroutename LIKE '_metadati%' OR tt.mdroutename LIKE '__metadati%')
  AND (
    ISNULL(tc.mchideinedit,0)<>ISNULL(sc.mchideinedit,0)
    OR ISNULL(tc.mchideinlist,0)<>ISNULL(sc.mchideinlist,0)
    OR ISNULL(tc.mc_ui_column_type,'')<>ISNULL(sc.mc_ui_column_type,'')
    OR ISNULL(tc.mcgrantbydefault,0)<>ISNULL(sc.mcgrantbydefault,0)
    OR ISNULL(tc.mc_is_primary_key,0)<>ISNULL(sc.mc_is_primary_key,0)
    OR ISNULL(tc.voa_class,1)<>ISNULL(sc.voa_class,1)
  )
"@
  $diffs = Invoke-Scalar -Db $target -Sql $sql
  Write-Host ("  {0,-25}  residual diffs (5 critical) = {1}" -f $target, $diffs)
}
