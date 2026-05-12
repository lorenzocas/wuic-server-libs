$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
$conn = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\sqlexpress;Initial Catalog=FatturazioneElettronica_Data;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$conn.Open()

# Mojibake patterns → corrected unicode chars (sourced via codepoint, no encoding issue)
# 'â‚¬' (U+00E2+U+201A+U+00AC) → '€' (U+20AC)
# 'Ã ' (U+00C3+U+0020) → 'à' (U+00E0)
# 'Ã©' (U+00C3+U+00A9) → 'é' (U+00E9)
# 'Ã¨' (U+00C3+U+00A8) → 'è' (U+00E8)
# 'Ã¬' (U+00C3+U+00AC) → 'ì' (U+00EC)
# 'Ã²' (U+00C3+U+00B2) → 'ò' (U+00F2)
# 'Ã¹' (U+00C3+U+00B9) → 'ù' (U+00F9)
$repls = @{
  ([string][char]0x00E2 + [char]0x201A + [char]0x00AC) = [string][char]0x20AC
  ([string][char]0x00C3 + [char]0x0020)                = [string][char]0x00E0
  ([string][char]0x00C3 + [char]0x00A9)                = [string][char]0x00E9
  ([string][char]0x00C3 + [char]0x00A8)                = [string][char]0x00E8
  ([string][char]0x00C3 + [char]0x00AC)                = [string][char]0x00EC
  ([string][char]0x00C3 + [char]0x00B2)                = [string][char]0x00F2
  ([string][char]0x00C3 + [char]0x00B9)                = [string][char]0x00F9
  ([string][char]0x00E2 + [char]0x20AC + [char]0x2122) = [string][char]0x2019  # ' smart apostrophe
  ([string][char]0x00E2 + [char]0x20AC + [char]0x0153) = [string][char]0x201C  # " left smart quote
}

# 1) Read all rows
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT id, body_html FROM dbo.email_template ORDER BY id"
$rdr = $cmd.ExecuteReader()
$rows = @()
while ($rdr.Read()) {
  $rows += [pscustomobject]@{ id = $rdr.GetInt32(0); body = $rdr.GetValue(1).ToString() }
}
$rdr.Close()

# 2) For each, apply replacements where needed
$updated = 0
foreach ($r in $rows) {
  $newBody = $r.body
  foreach ($pat in $repls.Keys) {
    if ($newBody.Contains($pat)) {
      $newBody = $newBody.Replace($pat, $repls[$pat])
    }
  }
  if ($newBody -ne $r.body) {
    $u = $conn.CreateCommand()
    $u.CommandText = "UPDATE dbo.email_template SET body_html = @b WHERE id = @id"
    $pBody = $u.Parameters.Add('@b', [System.Data.SqlDbType]::NVarChar, -1)
    $pBody.Value = $newBody
    $u.Parameters.AddWithValue('@id', $r.id) | Out-Null
    [void]$u.ExecuteNonQuery()
    $updated++
    Write-Host "  fixed id=$($r.id) (body length $($r.body.Length) -> $($newBody.Length))"
  }
}
$conn.Close()
Write-Host ""
Write-Host "Total updated rows: $updated"
