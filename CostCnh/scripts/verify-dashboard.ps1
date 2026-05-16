$cs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$c = New-Object System.Data.SqlClient.SqlConnection $cs
$c.Open()

foreach ($route in 'wf_cost_center_dashboard','wf_business_unit_dashboard') {
    $cmd = $c.CreateCommand()
    $cmd.CommandText = "SELECT CAST(boardcontent AS NVARCHAR(MAX)) FROM dom_board WHERE boardroute = @r"
    $null = $cmd.Parameters.AddWithValue('@r', $route)
    $bc = $cmd.ExecuteScalar()
    $cmd.Parameters.Clear()

    $dsCount = ([regex]::Matches($bc, '"wuic-data-source')).Count
    $drCount = ([regex]::Matches($bc, '"wuic-data-repeater')).Count
    $routeMatches = [regex]::Matches($bc, '"route":"([^"]+)"')
    $routes = @{}
    foreach ($m in $routeMatches) {
        $r = $m.Groups[1].Value
        if (-not $routes.ContainsKey($r)) { $routes[$r] = 0 }
        $routes[$r]++
    }
    $titleMatches = [regex]::Matches($bc, '"innerText":"([^"]+)"')
    $titles = @()
    foreach ($m in $titleMatches) { $titles += $m.Groups[1].Value }

    Write-Host ("--- $route (size=$($bc.Length) chars) ---")
    Write-Host "  datasources=$dsCount  datarepeaters=$drCount"
    Write-Host "  routes referenced:"
    foreach ($k in $routes.Keys | Sort-Object) { Write-Host "    $($routes[$k])x  $k" }
    Write-Host "  titles:"
    foreach ($t in $titles) { Write-Host "    $t" }
    Write-Host ""
}
$c.Close()
