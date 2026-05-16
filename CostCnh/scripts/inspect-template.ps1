$j = Get-Content -Raw C:/src/Wuic/KonvergenceCore/skills/dashboard-boardcontent/templates/2x2-grid-with-charts.template.json | ConvertFrom-Json -AsHashtable

function FindByTag {
    param($n, [string]$tagPrefix)
    $res = @()
    if ($n -is [hashtable]) {
        if ($n.tag -and $n.tag.StartsWith($tagPrefix)) { $res += @($n) }
        if ($n.nestedComponents) { foreach ($c in $n.nestedComponents) { $res += FindByTag $c $tagPrefix } }
    } elseif ($n -is [array]) {
        foreach ($c in $n) { $res += FindByTag $c $tagPrefix }
    }
    return $res
}

$reps = FindByTag $j '<wuic-data-repeater'
$dss = FindByTag $j '<wuic-data-source'
Write-Host "Found $($reps.Count) DATAREPEATER nodes, $($dss.Count) DATASOURCE nodes"

Write-Host "`n--- DATAREPEATER[0] (first chart) inputs keys:"
$reps[0].inputs.Keys | Sort-Object

Write-Host "`n--- DATAREPEATER[0].inputs (selected):"
foreach ($k in 'action','route','dataField','labelField','datasets','sortInfo','filterInfo','chartType','colorField') {
    if ($reps[0].inputs.ContainsKey($k)) {
        Write-Host "  $k = $($reps[0].inputs[$k] | ConvertTo-Json -Depth 4 -Compress)"
    }
}

Write-Host "`n--- DATASOURCE[0].inputs keys:"
$dss[0].inputs.Keys | Sort-Object

Write-Host "`n--- DATASOURCE[0].inputs.route = $($dss[0].inputs.route)"
Write-Host "--- DATASOURCE[0].inputs.metaInfo keys:"
if ($dss[0].inputs.metaInfo) { $dss[0].inputs.metaInfo.Keys | Sort-Object }
