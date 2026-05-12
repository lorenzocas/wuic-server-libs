$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
$conn = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\sqlexpress;Initial Catalog=FlottaMezzi_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "UPDATE c SET c.mc_display_string_in_view = @new FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id=c.md_id WHERE t.mdroutename = 'rifornimenti' AND c.mc_nome_colonna = 'prezzo_litro'"
$p = $cmd.Parameters.Add('@new', [System.Data.SqlDbType]::NVarChar, 200)
$p.Value = [string][char]0x20AC + '/L'
$rows = $cmd.ExecuteNonQuery()
Write-Host "rows updated: $rows"

$cmd2 = $conn.CreateCommand()
$cmd2.CommandText = "SELECT c.mc_display_string_in_view FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id=c.md_id WHERE t.mdroutename = 'rifornimenti' AND c.mc_nome_colonna = 'prezzo_litro'"
$val = $cmd2.ExecuteScalar()
Write-Host "display now = '$val'  (length=$($val.Length))"
$conn.Close()
