
$conn = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\sqlexpress;Initial Catalog=FlottaMezzi_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT CAST(boardcontent AS NVARCHAR(MAX)) FROM dom_board WHERE boardroute='costi_forecast'"
$json = $cmd.ExecuteScalar()
$conn.Close()
[System.IO.File]::WriteAllText('C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_costi_forecast_current.json', $json)
Write-Host "len=$($json.Length)"
