param(
  [string]$DataConnectionString,
  [string]$MetadataConnectionString
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($MetadataConnectionString)) {
  throw "[metadata-patch:20260322_crm_cases_sla] MetadataConnectionString is empty."
}

$sql = @"
DECLARE @route SYSNAME = 'crm_cases';
DECLARE @md_id INT;

SELECT @md_id = md_id
FROM _metadati__tabelle
WHERE mdroutename = @route;

IF @md_id IS NULL
BEGIN
  RAISERROR('Route metadata not found: %s', 16, 1, @route);
  RETURN;
END

IF NOT EXISTS (SELECT 1 FROM _metadati__colonne WHERE md_id = @md_id AND mc_nome_colonna = 'sla_due_at')
BEGIN
  DECLARE @template_due INT;
  SELECT TOP 1 @template_due = mc_id
  FROM _metadati__colonne
  WHERE md_id = @md_id
  ORDER BY mcordine, mc_id;

  IF @template_due IS NULL
  BEGIN
    RAISERROR('Template metadata column not found for route: %s', 16, 1, @route);
    RETURN;
  END

  INSERT INTO _metadati__colonne
  (
    mc_validation_type, mc_validation_required, mc_validation_message, mc_validation_has,
    mc_validation_custom_callback, mc_ui_size_width, mc_ui_size_height, mc_ui_column_type,
    mc_nome_colonna, mc_logic_nullable, mc_logic_editable, mc_lgc_cnverter_write_callback,
    mc_lgc_converter_read_callback, mc_logic_converter_has, mc_is_primary_key,
    mc_display_string_in_view, mc_display_string_in_edit, mc_db_column_type, md_id,
    voa_class, mcordine, mcrealcolumnname
  )
  SELECT
    mc_validation_type, 0, mc_validation_message, mc_validation_has,
    mc_validation_custom_callback, mc_ui_size_width, mc_ui_size_height, 'datetime',
    'sla_due_at', mc_logic_nullable, 0, mc_lgc_cnverter_write_callback,
    mc_lgc_converter_read_callback, mc_logic_converter_has, 0,
    'SLA Due At', 'SLA Due At', 'datetime2', @md_id,
    voa_class, (SELECT ISNULL(MAX(mcordine),0)+1 FROM _metadati__colonne WHERE md_id=@md_id), 'sla_due_at'
  FROM _metadati__colonne
  WHERE mc_id = @template_due;
END
ELSE
BEGIN
  UPDATE _metadati__colonne
  SET mc_logic_editable = 0,
      mc_db_column_type = 'datetime2',
      mc_ui_column_type = 'datetime',
      mc_display_string_in_view = 'SLA Due At',
      mc_display_string_in_edit = 'SLA Due At',
      mcrealcolumnname = 'sla_due_at'
  WHERE md_id = @md_id
    AND mc_nome_colonna = 'sla_due_at';
END

IF NOT EXISTS (SELECT 1 FROM _metadati__colonne WHERE md_id = @md_id AND mc_nome_colonna = 'sla_breached')
BEGIN
  DECLARE @template_breach INT;
  SELECT TOP 1 @template_breach = mc_id
  FROM _metadati__colonne
  WHERE md_id = @md_id
  ORDER BY mcordine, mc_id;

  INSERT INTO _metadati__colonne
  (
    mc_validation_type, mc_validation_required, mc_validation_message, mc_validation_has,
    mc_validation_custom_callback, mc_ui_size_width, mc_ui_size_height, mc_ui_column_type,
    mc_nome_colonna, mc_logic_nullable, mc_logic_editable, mc_lgc_cnverter_write_callback,
    mc_lgc_converter_read_callback, mc_logic_converter_has, mc_is_primary_key,
    mc_display_string_in_view, mc_display_string_in_edit, mc_db_column_type, md_id,
    voa_class, mcordine, mcrealcolumnname
  )
  SELECT
    mc_validation_type, 0, mc_validation_message, mc_validation_has,
    mc_validation_custom_callback, mc_ui_size_width, mc_ui_size_height, 'boolean',
    'sla_breached', mc_logic_nullable, 0, mc_lgc_cnverter_write_callback,
    mc_lgc_converter_read_callback, mc_logic_converter_has, 0,
    'SLA Breached', 'SLA Breached', 'bit', @md_id,
    voa_class, (SELECT ISNULL(MAX(mcordine),0)+1 FROM _metadati__colonne WHERE md_id=@md_id), 'sla_breached'
  FROM _metadati__colonne
  WHERE mc_id = @template_breach;
END
ELSE
BEGIN
  UPDATE _metadati__colonne
  SET mc_logic_editable = 0,
      mc_db_column_type = 'bit',
      mc_ui_column_type = 'boolean',
      mc_display_string_in_view = 'SLA Breached',
      mc_display_string_in_edit = 'SLA Breached',
      mcrealcolumnname = 'sla_breached'
  WHERE md_id = @md_id
    AND mc_nome_colonna = 'sla_breached';
END

DELETE FROM _metadati__u_i__stili__tabelle
WHERE mdid = @md_id
  AND mustattributename = 'mcgridconditionaltemplateclass';

INSERT INTO _metadati__u_i__stili__tabelle(mdid, mustattributename, mustattributevalue)
VALUES
(
  @md_id,
  'mcgridconditionaltemplateclass',
  '(record && Number((record.sla_breached ?? record.SlaBreached ?? 0)) === 1) ? ''row-danger'' : '''''
);
"@

$cn = New-Object System.Data.SqlClient.SqlConnection($MetadataConnectionString)
$cn.Open()
try {
  $cmd = $cn.CreateCommand()
  $cmd.CommandText = $sql
  [void]$cmd.ExecuteNonQuery()
  Write-Host "[metadata-patch:20260322_crm_cases_sla] applied."
}
finally {
  $cn.Close()
  $cn.Dispose()
}
