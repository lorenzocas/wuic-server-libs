$c = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$c.Open()
$cmd = $c.CreateCommand()
$cmd.CommandText = "SELECT CAST(boardcontent AS NVARCHAR(MAX)) FROM dom_board WHERE boardroute = 'plan_facts_poweredit'"
$bc = $cmd.ExecuteScalar()
$c.Close()
Write-Host ("size                = $($bc.Length) chars")
Write-Host ("wuic-data-source    = $(([regex]::Matches($bc, 'wuic-data-source')).Count)")
Write-Host ("wuic-data-repeater  = $(([regex]::Matches($bc, 'wuic-data-repeater')).Count)")
Write-Host ("action=spreadsheet  = $(([regex]::Matches($bc, '"action":"spreadsheet"')).Count)")
Write-Host ("enableLockAwareness = $(([regex]::Matches($bc, 'enableLockAwareness')).Count)")
Write-Host ("showFormulaBar=true = $(([regex]::Matches($bc, '"showFormulaBar":true')).Count)")
Write-Host ("PowerEdit titles    = $(([regex]::Matches($bc, 'PowerEdit')).Count)")
