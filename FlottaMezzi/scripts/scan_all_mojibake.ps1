# Scansione mojibake (UTF-8 → CP1252) su tutti i DB rilevanti.
# Pattern tipici: 'â' o 'Ã' seguiti da chars 0x80-0xFF — sequenze quasi sempre
# false positive solo su testi italiani/spagnoli con caratteri accentati.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data

$dbs = @(
  'Kiara_wuic_new',
  'metadataDB',
  'FlottaMezzi_Metadata',
  'FlottaMezzi_Data',
  'FatturazioneElettronica_Metadata',
  'FatturazioneElettronica_Data'
)

# Pattern mojibake. CS_AS = case-sensitive accent-sensitive per match esatto.
# 'â‚¬' = € corrotto (3 byte E2 82 AC interpretati come CP1252)
# 'Ã ' 'Ã©' 'Ã¨' 'Ã¬' 'Ã²' 'Ã¹' = à é è ì ò ù
# 'â€™' 'â€œ' 'â€' = ' " " corrotti
$mojibakeWhere = @"
(
  CHARINDEX(N'â‚¬', __VAL__ COLLATE Latin1_General_CS_AS) > 0
  OR CHARINDEX(N'Ã ', __VAL__ COLLATE Latin1_General_CS_AS) > 0
  OR CHARINDEX(N'Ã©', __VAL__ COLLATE Latin1_General_CS_AS) > 0
  OR CHARINDEX(N'Ã¨', __VAL__ COLLATE Latin1_General_CS_AS) > 0
  OR CHARINDEX(N'Ã¬', __VAL__ COLLATE Latin1_General_CS_AS) > 0
  OR CHARINDEX(N'Ã²', __VAL__ COLLATE Latin1_General_CS_AS) > 0
  OR CHARINDEX(N'Ã¹', __VAL__ COLLATE Latin1_General_CS_AS) > 0
  OR CHARINDEX(N'â€™', __VAL__ COLLATE Latin1_General_CS_AS) > 0
  OR CHARINDEX(N'â€œ', __VAL__ COLLATE Latin1_General_CS_AS) > 0
)
"@

function Get-Connection {
  param([string]$Db)
  $cs = "Data Source=localhost\sqlexpress;Initial Catalog=$Db;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True"
  $c = New-Object System.Data.SqlClient.SqlConnection $cs
  $c.Open()
  return $c
}

function Get-StringColumns {
  param([System.Data.SqlClient.SqlConnection]$Conn, [string]$Schema='dbo')
  $cmd = $Conn.CreateCommand()
  $cmd.CommandText = @"
SELECT TABLE_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @s
  AND DATA_TYPE IN ('nvarchar','varchar','nchar','char','ntext','text')
  AND TABLE_NAME NOT LIKE '#%'
  AND TABLE_NAME NOT LIKE 'sys%'
"@
  [void]$cmd.Parameters.AddWithValue('@s', $Schema)
  $rdr = $cmd.ExecuteReader()
  $cols = @()
  while ($rdr.Read()) {
    $cols += [pscustomobject]@{ Table = $rdr.GetString(0); Column = $rdr.GetString(1) }
  }
  $rdr.Close()
  return $cols
}

$allFindings = @()

foreach ($db in $dbs) {
  Write-Host ""
  Write-Host "=== Scanning $db ===" -ForegroundColor Cyan
  try {
    $conn = Get-Connection -Db $db
  } catch {
    Write-Host "  [skip] non raggiungibile: $($_.Exception.Message)" -ForegroundColor Yellow
    continue
  }

  $strCols = Get-StringColumns -Conn $conn
  Write-Host "  $($strCols.Count) string columns to scan" -ForegroundColor DarkGray

  $matches = 0
  foreach ($sc in $strCols) {
    $whereClause = $mojibakeWhere.Replace('__VAL__', "[$($sc.Column)]")
    $sql = "SELECT TOP 50 [$($sc.Column)] AS val, COUNT(*) OVER() AS total FROM dbo.[$($sc.Table)] WHERE [$($sc.Column)] IS NOT NULL AND $whereClause"
    try {
      $cmd = $conn.CreateCommand()
      $cmd.CommandText = $sql
      $cmd.CommandTimeout = 30
      $rdr = $cmd.ExecuteReader()
      $sampleVals = @()
      $totalCount = 0
      while ($rdr.Read()) {
        $totalCount = $rdr.GetInt32(1)
        $sampleVals += $rdr.GetValue(0).ToString().Substring(0, [Math]::Min(80, $rdr.GetValue(0).ToString().Length))
      }
      $rdr.Close()
      if ($totalCount -gt 0) {
        $matches++
        $allFindings += [pscustomobject]@{
          Db = $db; Table = $sc.Table; Column = $sc.Column;
          Count = $totalCount; Samples = ($sampleVals | Select-Object -First 3) -join ' | '
        }
        Write-Host ("  [HIT] {0}.{1}  rows={2}  sample={3}" -f $sc.Table, $sc.Column, $totalCount, ($sampleVals[0])) -ForegroundColor Red
      }
    } catch {
      # Some columns can't be COLLATE-cast (e.g., text/ntext) — skip silently
    }
  }
  Write-Host "  Total columns with mojibake: $matches" -ForegroundColor $(if ($matches -gt 0) { 'Yellow' } else { 'Green' })
  $conn.Close()
}

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total findings: $($allFindings.Count)"
$allFindings | Format-Table -AutoSize -Wrap

$allFindings | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 'C:\src\Wuic\FlottaMezzi\scripts\_mojibake_findings.json'
Write-Host "Full report: C:\src\Wuic\FlottaMezzi\scripts\_mojibake_findings.json"
