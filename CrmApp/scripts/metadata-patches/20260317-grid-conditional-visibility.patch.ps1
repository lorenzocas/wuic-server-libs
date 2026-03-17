param(
  [string]$DataConnectionString,
  [string]$MetadataConnectionString
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($MetadataConnectionString)) {
  throw "[metadata-patch:20260317_grid_conditional_visibility] MetadataConnectionString is empty."
}

$rules = @(
  @{
    Route = 'crm_opportunities'
    CssClass = 'row-danger'
    Condition = "record && record.expected_close_date && (new Date(record.expected_close_date).getTime() < Date.now()) && Number((record.Stato_Record ?? record.stato_record ?? 0)) === 0"
  },
  @{
    Route = 'crm_leads'
    CssClass = 'row-warning'
    Condition = "record && record.updated_at && ((Date.now() - new Date(record.updated_at).getTime()) > (7 * 24 * 60 * 60 * 1000))"
  },
  @{
    Route = 'crm_activities'
    CssClass = 'row-success'
    Condition = "record && Number((record.completed ?? 0)) === 1"
  },
  @{
    Route = 'crm_activities'
    CssClass = 'row-danger'
    Condition = "record && record.due_date && (new Date(record.due_date).getTime() < Date.now()) && Number((record.completed ?? 0)) === 0"
  }
)

$cn = New-Object System.Data.SqlClient.SqlConnection($MetadataConnectionString)
$cn.Open()
try {
  foreach ($rule in $rules) {
    $sql = @"
DECLARE @md_id INT;
SELECT @md_id = md_id
FROM _metadati__tabelle
WHERE mdroutename = @route;

IF @md_id IS NULL
BEGIN
  RAISERROR('Route metadata not found: %s', 16, 1, @route);
  RETURN;
END

DELETE FROM _metadati__u_i__stili__tabelle
WHERE mdid = @md_id
  AND mustattributename = @cssClass;

INSERT INTO _metadati__u_i__stili__tabelle(mdid, mustattributename, mustattributevalue)
VALUES(@md_id, @cssClass, @condition);
"@

    $cmd = $cn.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.Parameters.AddWithValue('@route', [string]$rule.Route) | Out-Null
    $cmd.Parameters.AddWithValue('@cssClass', [string]$rule.CssClass) | Out-Null
    $cmd.Parameters.AddWithValue('@condition', [string]$rule.Condition) | Out-Null
    [void]$cmd.ExecuteNonQuery()
  }

  Write-Host "[metadata-patch:20260317_grid_conditional_visibility] applied."
}
finally {
  $cn.Close()
  $cn.Dispose()
}

