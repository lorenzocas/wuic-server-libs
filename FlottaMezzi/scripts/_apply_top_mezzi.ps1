
$ErrorActionPreference='Stop'
$json = [System.IO.File]::ReadAllText('C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_top_mezzi_patched.json')
Add-Type -AssemblyName System.Data
$conn = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\sqlexpress;Initial Catalog=FlottaMezzi_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = 'UPDATE dom_board SET boardcontent = @j WHERE boardroute = @r'
[void]$cmd.Parameters.AddWithValue('@j', $json)
[void]$cmd.Parameters.AddWithValue('@r', 'top_mezzi')
$rows = $cmd.ExecuteNonQuery()
$conn.Close()
Write-Host "rows: $rows"
