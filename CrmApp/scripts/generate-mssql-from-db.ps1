param(
    [string]$Server = "localhost\sqlexpress",
    [string]$User = "sa",
    [string]$Password = "superlamelauser",
    [string]$Database = "MetadataDB"
)

$ErrorActionPreference = "Stop"

$targetScript = Join-Path $PSScriptRoot "..\..\KonvergenceCore\scripts\generate-mssql-from-db.ps1"
$targetScript = [System.IO.Path]::GetFullPath($targetScript)

if (-not (Test-Path $targetScript)) {
    throw "Target script not found: $targetScript"
}

$invokeArgs = @(
    '-Server', $Server,
    '-User', $User,
    '-Password', $Password,
    '-Database', $Database
)

& $targetScript @invokeArgs
exit $LASTEXITCODE
