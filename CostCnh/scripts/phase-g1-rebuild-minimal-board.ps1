<#
.SYNOPSIS
  Phase G.1 fix — rebuild dom_board.plan_facts_poweredit con boardcontent
  hand-crafted minimal (no clone template). Singolo widget DATASOURCE +
  DATAREPEATER action=spreadsheet con lock-awareness opt-in.
#>
$ErrorActionPreference = 'Stop'
$metaCs = 'Data Source=localhost\sqlexpress;Initial Catalog=CostCnh_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'

# Fetch table+column metadata for plan_facts via API
$loginBody = @{ user_name = 'admin'; password = 'admin'; captchaToken = '' } | ConvertTo-Json -Compress
$resp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/Meta/AsmxProxy/MetaService.login' -ContentType 'application/json' -Body $loginBody -SkipCertificateCheck
foreach ($s in @($resp.Headers['Set-Cookie'])) { if ($s -match '^\s*k-user=([^;]+)') { $kc = $Matches[1]; break } }
$h = @{ 'Cookie' = "k-user=$kc" }

$tmResp = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/Meta/AsmxProxy/MetaService.getTableMetadata' -ContentType 'application/json' -Body '{"route":"plan_facts"}' -Headers $h -SkipCertificateCheck
$tm = $tmResp.Content | ConvertFrom-Json -AsHashtable -NoEnumerate
$tableMd = $tm.tableMetadata
$columnMd = @($tm.columnMetadata | ForEach-Object { $c = $_; if ($c.ContainsKey('extraProps')) { $c.Remove('extraProps') | Out-Null }; $c })
$operators = if ($tm.ContainsKey('operators') -and $tm.operators) { $tm.operators } else { @{} }
Write-Host "[fetch] plan_facts: $($columnMd.Count) columns, table md_id=$($tableMd.md_id)" -ForegroundColor Green

# Minimal boardcontent: TABLE > TR > TD > DIV > [SPAN title, DATASOURCE, DATAREPEATER]
# Layout 1x1 — singolo widget full-height per il spreadsheet.
$boardJson = @"
[{"name":"TABLE","tag":"<table style='width:100%;height:100%;'>","nestedComponents":[
  {"name":"TR","tag":"<tr style='height:40px;'>","nestedComponents":[
    {"name":"TD","tag":"<td>","nestedComponents":[
      {"name":"SPAN","tag":"<span [attr.id]=\"uniqueName\">","inputs":{
        "innerText":"PowerEdit — Plan Facts spreadsheet (Syncfusion lock-aware)",
        "uniqueName":"title_plan_facts_poweredit",
        "fontWeight":"bold","fontSize":"16px","color":"inherit","backgroundColor":"transparent"
      }}
    ]}
  ]},
  {"name":"TR","tag":"<tr style='height:calc(100% - 40px);'>","nestedComponents":[
    {"name":"TD","tag":"<td>","nestedComponents":[
      {"name":"DIV","tag":"<div style='height:100%;width:100%;'>","nestedComponents":[
        {"name":"DATASOURCE","tag":"<wuic-data-source [attr.id]=\"uniqueName\" [route]=\"inputs.route\" [metaInfo]=\"inputs.metaInfo\">","inputs":{
          "uniqueName":"ds_plan_facts_poweredit",
          "route":"plan_facts",
          "autoload":true,
          "metaInfo":__METAINFO_PLACEHOLDER__
        }},
        {"name":"DATAREPEATER","tag":"<wuic-data-repeater [attr.id]=\"uniqueName\" [datasource]=\"inputs.datasource\" [action]=\"inputs.action\">","inputs":{
          "uniqueName":"dr_plan_facts_poweredit",
          "action":"spreadsheet",
          "enableLockAwareness":true,
          "lockEndpointBase":"/api/spreadsheet",
          "showFormulaBar":true,
          "showRibbon":false,
          "heartbeatIntervalSec":60,
          "hideToolbar":false,
          "datasource":null,
          "height":"100%"
        }}
      ]}
    ]}
  ]}
]}]
"@

# Inject metaInfo placeholder
$metaInfo = @{
    tableMetadata = $tableMd
    columnMetadata = $columnMd
    operators = $operators
    dataTabs = if ($tm.ContainsKey('dataTabs')) { $tm.dataTabs } else { @() }
    pKey = if ($tm.ContainsKey('pKey')) { $tm.pKey } else { 'id' }
    hasFooter = $false
    editMode = 'inline'
    nestedRoutes = if ($tm.ContainsKey('nestedRoutes')) { $tm.nestedRoutes } else { @() }
    rowsPerPageOptions = @(50, 100, 200)
}
$metaInfoJson = $metaInfo | ConvertTo-Json -Depth 12 -Compress
$boardJson = $boardJson.Replace('__METAINFO_PLACEHOLDER__', $metaInfoJson)

# Validate JSON
try {
    $parsed = $boardJson | ConvertFrom-Json
    Write-Host "[validate] JSON OK, size=$($boardJson.Length) chars, top-level array count=$($parsed.Count)" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] JSON invalid: $($_.Exception.Message)" -ForegroundColor Red
    throw
}

# Upsert dom_board
$conn = New-Object System.Data.SqlClient.SqlConnection $metaCs; $conn.Open()
$existing = $conn.CreateCommand()
$existing.CommandText = "SELECT TOP 1 id1 FROM dom_board WHERE boardroute = 'plan_facts_poweredit'"
$id = $existing.ExecuteScalar()
if ($null -ne $id -and $id -isnot [DBNull]) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "UPDATE dom_board SET boarddes = @d, boardcontent = @c WHERE id1 = @id"
    $null = $cmd.Parameters.AddWithValue('@d', 'PowerEdit Plan Facts — Syncfusion spreadsheet lock-aware')
    $null = $cmd.Parameters.AddWithValue('@c', $boardJson)
    $null = $cmd.Parameters.AddWithValue('@id', [int]$id)
    $null = $cmd.ExecuteNonQuery()
    Write-Host "[update] dom_board.plan_facts_poweredit (id=$id, $($boardJson.Length) chars)" -ForegroundColor Yellow
} else {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "INSERT INTO dom_board (boardroute, boarddes, boardcontent) VALUES (@r, @d, @c)"
    $null = $cmd.Parameters.AddWithValue('@r', 'plan_facts_poweredit')
    $null = $cmd.Parameters.AddWithValue('@d', 'PowerEdit Plan Facts — Syncfusion spreadsheet lock-aware')
    $null = $cmd.Parameters.AddWithValue('@c', $boardJson)
    $null = $cmd.ExecuteNonQuery()
    Write-Host "[insert] dom_board.plan_facts_poweredit ($($boardJson.Length) chars)" -ForegroundColor Green
}
$conn.Close()

# Invalidate metadata runtime
$inv = Invoke-WebRequest -Method Post -Uri 'https://localhost:6543/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime' -ContentType 'application/json' -Body '{}' -Headers $h -SkipCertificateCheck
Write-Host "[invalidate] $($inv.Content.Substring(0, [Math]::Min(160, $inv.Content.Length)))" -ForegroundColor Green
