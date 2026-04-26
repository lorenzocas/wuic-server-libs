<#
.SYNOPSIS
  One-shot IIS setup for the WuicSiteApi sub-application.

.DESCRIPTION
  Idempotent. Run on the IIS server (or via SSH from the dev machine).
  Creates:
    - Folder C:\inetpub\wwwroot\WuicSite\api (if missing)
    - AppPool WuicSiteApiPool (NoManagedCode + Integrated + AlwaysRunning + idleTimeout=0)
    - Sub-application /api under the WuicSite IIS site
    - Read+Execute ACL for IIS APPPOOL\WuicSiteApiPool on the api folder
    - Placeholder appsettings.json (NEVER overwritten if existing)

  After running this script the operator MUST edit
  C:\inetpub\wwwroot\WuicSite\api\appsettings.json on the server
  with the real PayPal Client SECRET (sandbox + live) before the API is usable.
  The deploy script excludes appsettings.json from upload so this file is
  always server-managed.
#>

$ErrorActionPreference = 'Stop'
Import-Module WebAdministration

$siteName = 'WuicSite'
$apiAppName = 'api'
$apiPath = 'C:\inetpub\wwwroot\WuicSite\api'
$apiPoolName = 'WuicSiteApiPool'

Write-Host "=== 1) Cartella api/ ==="
if (-not (Test-Path $apiPath)) {
    New-Item -ItemType Directory -Path $apiPath -Force | Out-Null
    Write-Host "  creata: $apiPath"
} else {
    Write-Host "  gia presente: $apiPath"
}

Write-Host "`n=== 2) AppPool $apiPoolName ==="
$pool = Get-Item "IIS:\AppPools\$apiPoolName" -ErrorAction SilentlyContinue
if ($null -eq $pool) {
    New-Item "IIS:\AppPools\$apiPoolName" | Out-Null
    Write-Host "  creato: $apiPoolName"
} else {
    Write-Host "  gia presente: $apiPoolName"
}

# .NET CLR Version = '' significa "No Managed Code" (richiesto per ASP.NET Core)
Set-ItemProperty "IIS:\AppPools\$apiPoolName" -Name managedRuntimeVersion -Value ''
Set-ItemProperty "IIS:\AppPools\$apiPoolName" -Name managedPipelineMode -Value Integrated
Set-ItemProperty "IIS:\AppPools\$apiPoolName" -Name startMode -Value AlwaysRunning
# Mantieni in vita: niente idle timeout (default 20min spegne il worker)
Set-ItemProperty "IIS:\AppPools\$apiPoolName" -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)
Write-Host "  config: NoManagedCode + Integrated + AlwaysRunning + idleTimeout=0"

Write-Host "`n=== 3) Sub-application /api sotto $siteName ==="
$existing = Get-WebApplication -Site $siteName -Name $apiAppName -ErrorAction SilentlyContinue
if ($null -eq $existing) {
    New-WebApplication -Site $siteName -Name $apiAppName -PhysicalPath $apiPath -ApplicationPool $apiPoolName | Out-Null
    Write-Host "  creata: /$apiAppName -> $apiPath (pool: $apiPoolName)"
} else {
    Set-ItemProperty "IIS:\Sites\$siteName\$apiAppName" -Name applicationPool -Value $apiPoolName
    Set-ItemProperty "IIS:\Sites\$siteName\$apiAppName" -Name physicalPath -Value $apiPath
    Write-Host "  gia presente: /$apiAppName (pool aggiornato a $apiPoolName)"
}

Write-Host "`n=== 4) Permessi cartella api ==="
$acl = Get-Acl $apiPath
$identity = "IIS APPPOOL\$apiPoolName"
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $identity, 'ReadAndExecute,ListDirectory', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
)
$acl.SetAccessRule($rule)
Set-Acl -Path $apiPath -AclObject $acl
Write-Host "  ReadAndExecute -> $identity"

Write-Host "`n=== 5) appsettings.json (placeholder) ==="
$prodSettings = Join-Path $apiPath 'appsettings.json'
if (Test-Path $prodSettings) {
    Write-Host "  gia presente, NON sovrascritto: $prodSettings"
} else {
    $template = @'
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "Paypal": {
    "Mode": "sandbox",
    "Sandbox": {
      "ClientId": "REPLACE_WITH_SANDBOX_CLIENT_ID",
      "ClientSecret": "REPLACE_WITH_SANDBOX_CLIENT_SECRET"
    },
    "Live": {
      "ClientId": "REPLACE_WITH_LIVE_CLIENT_ID",
      "ClientSecret": "REPLACE_WITH_LIVE_CLIENT_SECRET"
    }
  }
}
'@
    Set-Content -Path $prodSettings -Value $template -Encoding UTF8
    Write-Host "  creato placeholder: $prodSettings"
    Write-Host "  *** RICORDA DI VALORIZZARE I CLIENT SECRET PRIMA DI USARE LA /api ***" -ForegroundColor Yellow
}

Write-Host "`n=== Setup completato ==="
Write-Host "Verifica sub-application /api:"
Get-WebApplication -Site $siteName -Name $apiAppName | Select-Object Path, PhysicalPath, ApplicationPool | Format-List
