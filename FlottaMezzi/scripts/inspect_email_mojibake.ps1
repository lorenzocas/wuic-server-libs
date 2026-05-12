$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
$conn = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\sqlexpress;Initial Catalog=FatturazioneElettronica_Data;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$conn.Open()

# Build mojibake pattern strings via Unicode codepoints (no encoding ambiguity)
# 'â‚¬' (U+00E2 U+201A U+00AC) = € corrotto
# 'Ã ' (U+00C3 U+0020) = à
# 'Ã©' (U+00C3 U+00A9) = é
# 'Ã¨' (U+00C3 U+00A8) = è
# 'Ã¬' (U+00C3 U+00AC) = ì
# 'Ã²' (U+00C3 U+00B2) = ò
# 'Ã¹' (U+00C3 U+00B9) = ù
# 'â€™' (U+00E2 U+20AC U+2122) = ' (smart apostrophe)
# 'â€œ' (U+00E2 U+20AC U+0153) = " (left smart quote)
# 'â€' (U+00E2 U+20AC U+009D) = " (right smart quote)
$patterns = @(
  ([string][char]0x00E2 + [char]0x201A + [char]0x00AC),
  ([string][char]0x00C3 + [char]0x0020),
  ([string][char]0x00C3 + [char]0x00A9),
  ([string][char]0x00C3 + [char]0x00A8),
  ([string][char]0x00C3 + [char]0x00AC),
  ([string][char]0x00C3 + [char]0x00B2),
  ([string][char]0x00C3 + [char]0x00B9),
  ([string][char]0x00E2 + [char]0x20AC + [char]0x2122),
  ([string][char]0x00E2 + [char]0x20AC + [char]0x0153)
)

$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT id, descrizione, body_html FROM dbo.email_template ORDER BY id"
$rdr = $cmd.ExecuteReader()
$rows = @()
while ($rdr.Read()) {
  $rows += [pscustomobject]@{ id = $rdr.GetValue(0); name = $rdr.GetValue(1).ToString(); body = $rdr.GetValue(2).ToString() }
}
$rdr.Close()
$conn.Close()

foreach ($r in $rows) {
  $body = $r.body
  $hits = @()
  foreach ($p in $patterns) {
    $idx = 0
    while (($idx = $body.IndexOf($p, $idx)) -ge 0) {
      $start = [Math]::Max(0, $idx - 15)
      $len = [Math]::Min(50, $body.Length - $start)
      $ctx = $body.Substring($start, $len)
      $hits += [pscustomobject]@{ pattern = $p; pos = $idx; ctx = $ctx }
      $idx += $p.Length
    }
  }
  if ($hits.Count -eq 0) { continue }
  Write-Host ("=== id=$($r.id) name=$($r.name)  hits=$($hits.Count) ===")
  $hits | Select-Object -First 5 | ForEach-Object {
    $codepoints = ($_.pattern.ToCharArray() | ForEach-Object { 'U+{0:X4}' -f [int]$_ }) -join '+'
    Write-Host "  pos=$($_.pos)  pattern=[$codepoints]  ctx=...$($_.ctx)..."
  }
}
