$ErrorActionPreference = 'Stop'

# Login
$loginBody = @{ user_name = 'admin'; password = 'admin'; captchaToken = '' } | ConvertTo-Json -Compress
$resp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/Meta/AsmxProxy/MetaService.login' -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($resp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kc = $Matches[1]; break } }
$h = @{ 'Cookie' = "k-user=$kc" }
Write-Host "[login] ok" -ForegroundColor Green

# Find PROGRAM_PIVOT (now configured for xlsx)
$cs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Data;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$c = New-Object System.Data.SqlClient.SqlConnection $cs; $c.Open()
$cmd = $c.CreateCommand()
$cmd.CommandText = "SELECT TOP 1 id, output_format FROM rep.report_definition WHERE code = 'PROGRAM_PIVOT'"
$rd = $cmd.ExecuteReader()
$rd.Read() | Out-Null
$repId = [int]$rd['id']
$fmt = [string]$rd['output_format']
$rd.Close()
Write-Host "[def] id=$repId output_format=$fmt"

# Enqueue + dispatch
$body = @{ params = @{ site_id = 1 } } | ConvertTo-Json -Compress
$enq = Invoke-WebRequest -Method Post -Uri "https://localhost:6543/api/reports/run/$repId" -ContentType 'application/json' -Body $body -Headers $h -SkipCertificateCheck
Write-Host "[enqueue] $($enq.Content)"
$execId = ($enq.Content | ConvertFrom-Json).executionId

$disp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/scheduler/costcnh_outbox_dispatch' -ContentType 'application/json' -Body '{}' -Headers $h -SkipCertificateCheck
Write-Host "[dispatch] $($disp.Content)"

# Check execution + result_path
$cmd2 = $c.CreateCommand()
$cmd2.CommandText = "SELECT id, status, duration_ms, result_path FROM rep.report_execution WHERE id = $execId"
$r = $cmd2.ExecuteReader()
$r.Read() | Out-Null
$path = [string]$r['result_path']
Write-Host ""
Write-Host "[execution $($r['id'])] status=$($r['status']) duration=$($r['duration_ms'])ms result_path=$path"
$r.Close()
$c.Close()

# Download xlsx
if ($path -and (Test-Path $path)) {
    $size = (Get-Item $path).Length
    Write-Host ""
    Write-Host "[file] $path EXISTS — size=$size bytes" -ForegroundColor Green

    # Verify via download endpoint
    $tmp = "$env:TEMP\program_pivot_$execId.xlsx"
    Invoke-WebRequest -Uri "https://localhost:6543/api/reports/download/$execId" -Headers $h -SkipCertificateCheck -OutFile $tmp
    $tmpSize = (Get-Item $tmp).Length
    Write-Host "[download] /api/reports/download/$execId → $tmp ($tmpSize bytes)" -ForegroundColor Green

    # Open with OpenXml to verify it parses
    Add-Type -AssemblyName WindowsBase
    try {
        $pkg = [System.IO.Packaging.Package]::Open($tmp, 'Open', 'Read')
        $parts = @($pkg.GetParts() | ForEach-Object { $_.Uri.OriginalString })
        Write-Host "[verify] xlsx has $($parts.Count) parts (workbook.xml, sheet1.xml, ...)" -ForegroundColor Green
        $pkg.Close()
    } catch {
        Write-Host "[verify] failed: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "[file] NOT FOUND: $path" -ForegroundColor Red
}
