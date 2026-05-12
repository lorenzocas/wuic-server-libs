# Filtra il diff completo per evidenziare solo le differenze "vere"
# (non null vs 0/false), classificando per categoria di impatto.

$ErrorActionPreference = 'Stop'
$json = Get-Content -Raw -Encoding UTF8 'C:\src\Wuic\FlottaMezzi\scripts\_real_diff_full.json'
$all = $json | ConvertFrom-Json

# Categorize each diff
$categories = @{
  'CRITICAL_pk_missing' = @()             # mc_is_primary_key 0/null vs 1
  'CRITICAL_widget_type_diff' = @()        # mc_ui_column_type ≠ (text vs lookupByID, ecc.)
  'CRITICAL_voa_class_diff' = @()          # voa_class ≠ (subclass discrimnator!)
  'IMPORTANT_visibility_diff' = @()        # mchideinedit/list/detail/service/export ≠
  'IMPORTANT_grant_diff' = @()             # mcgrantbydefault ≠
  'IMPORTANT_validation_diff' = @()        # mc_validation_*
  'IMPORTANT_lookup_diff' = @()            # mc_ui_lookup_* (entity, value/text field)
  'NOISE_null_vs_false' = @()              # null vs false/0 (no functional impact)
  'NOISE_default_value_norm' = @()         # min/maxlength null vs 0
  'NOISE_ordine_or_size' = @()             # mcordine/size_width/size_height
  'OTHER' = @()
}

function Is-NullVsFalseZero($a, $b) {
  $aNull = ($null -eq $a) -or ($a -eq '') -or ($a -eq 0) -or ($a -eq $false) -or ($a.ToString().ToLower() -eq 'false') -or ($a.ToString() -eq '0')
  $bNull = ($null -eq $b) -or ($b -eq '') -or ($b -eq 0) -or ($b -eq $false) -or ($b.ToString().ToLower() -eq 'false') -or ($b.ToString() -eq '0')
  return ($aNull -and $bNull)
}

foreach ($d in $all) {
  $p = $d.prop
  $vk = $d.kiara
  $vf = $d.fe
  if (Is-NullVsFalseZero $vk $vf) {
    $categories['NOISE_null_vs_false'] += $d
    continue
  }
  switch -Wildcard ($p) {
    'mc_is_primary_key' { $categories['CRITICAL_pk_missing'] += $d; break }
    'voa_class' { $categories['CRITICAL_voa_class_diff'] += $d; break }
    'mc_ui_column_type' { $categories['CRITICAL_widget_type_diff'] += $d; break }
    { $_ -in @('mchideinedit','mchideinlist','mchideindetail','mchideinservice','mchideinexport') } { $categories['IMPORTANT_visibility_diff'] += $d; break }
    'mcgrantbydefault' { $categories['IMPORTANT_grant_diff'] += $d; break }
    { $_ -like 'mcvalidation*' -or $_ -eq 'mc_validation_required' -or $_ -eq 'mc_validation_has' -or $_ -eq 'mc_validation_message' } { $categories['IMPORTANT_validation_diff'] += $d; break }
    { $_ -like 'mcuilookup*' -or $_ -like 'mc_ui_lookup*' } { $categories['IMPORTANT_lookup_diff'] += $d; break }
    { $_ -in @('mcvalidationminlength','mcvalidationmaxlength','mcmaxlength','mcdefaultmultisortorder') } { $categories['NOISE_default_value_norm'] += $d; break }
    { $_ -in @('mcordine','mc_ui_size_width','mc_ui_size_height','mcuigridsizewidth') } { $categories['NOISE_ordine_or_size'] += $d; break }
    default { $categories['OTHER'] += $d }
  }
}

Write-Host '=== Diff classification (8507 total) ==='
foreach ($key in $categories.Keys | Sort-Object) {
  $count = $categories[$key].Count
  if ($count -gt 0) {
    Write-Host ("{0,5}  {1}" -f $count, $key)
  }
}

Write-Host ''
Write-Host '=== CRITICAL diffs (require attention) ==='
foreach ($key in @('CRITICAL_pk_missing','CRITICAL_voa_class_diff','CRITICAL_widget_type_diff')) {
  if ($categories[$key].Count -eq 0) { continue }
  Write-Host "--- $key ---"
  $categories[$key] | Select-Object -First 30 | ForEach-Object {
    Write-Host ("  {0,-30}  {1,-40}  kiara={2}  fe={3}" -f $_.route.Trim(), $_.col, $_.kiara, $_.fe)
  }
  if ($categories[$key].Count -gt 30) {
    Write-Host "  ... ($($categories[$key].Count - 30) more)"
  }
}

Write-Host ''
Write-Host '=== IMPORTANT diffs (sample 10 per category) ==='
foreach ($key in @('IMPORTANT_visibility_diff','IMPORTANT_grant_diff','IMPORTANT_validation_diff','IMPORTANT_lookup_diff')) {
  if ($categories[$key].Count -eq 0) { continue }
  Write-Host "--- $key (total: $($categories[$key].Count)) ---"
  $categories[$key] | Select-Object -First 10 | ForEach-Object {
    Write-Host ("  {0,-30}  {1,-40}  {2,-25}  k={3}  f={4}" -f $_.route.Trim(), $_.col, $_.prop, $_.kiara, $_.fe)
  }
}
