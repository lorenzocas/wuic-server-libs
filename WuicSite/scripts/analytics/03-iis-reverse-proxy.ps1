<#
.SYNOPSIS
    Plausible self-hosted — FASE 3 (manuale, dopo che :8000 risponde).

.DESCRIPTION
    Espone Plausible (WSL, localhost:8000) su https://analytics.wuic-framework.com
    tramite IIS come reverse proxy. Da lanciare come Administrator SOLO dopo aver
    verificato che la fase 2 ha finito e `curl http://localhost:8000/api/health`
    risponde.

      1. Installa ARR (URL Rewrite e WebSocket sono gia' presenti sul server).
      2. Abilita il proxy ARR a livello server.
      3. Crea il sito IIS 'WuicAnalytics' + web.config di reverse proxy con
         preserveHostHeader e passthrough WebSocket (Plausible usa LiveView).
      4. Emette il certificato con win-acme (gia' installato) e crea il
         binding 443 + redirect http->https.

.NOTES
    win-acme rilevato in C:\tools\win-acme\wacs.exe. Il dominio
    analytics.wuic-framework.com risolve gia' su questo server (wildcard DNS).
#>
[CmdletBinding()]
param(
    [string]$Fqdn        = 'analytics.wuic-framework.com',
    [int]$UpstreamPort   = 8000,
    [string]$SitePath    = 'C:\inetpub\analytics',
    [string]$SiteName    = 'WuicAnalytics',
    [string]$WacsPath    = 'C:\tools\win-acme\wacs.exe',
    [string]$ArrMsiUrl   = 'https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi'
)

$ErrorActionPreference = 'Stop'
Import-Module WebAdministration

# 0) Preflight: Plausible deve gia' rispondere localmente.
Write-Host '[0] Verifico che Plausible risponda su localhost:' $UpstreamPort -ForegroundColor Cyan
try {
    $h = Invoke-WebRequest -Uri "http://localhost:$UpstreamPort/api/health" -UseBasicParsing -TimeoutSec 8
    Write-Host "    OK ($($h.StatusCode))" -ForegroundColor Green
} catch {
    throw "Plausible non risponde su localhost:$UpstreamPort. Verifica la fase 2 (Get-Content C:\wuic-analytics\phase2.log) prima di procedere."
}

# 1) ARR (Rewrite + WebSocket gia' presenti).
$hasArr = Get-WebGlobalModule | Where-Object { $_.Name -match 'ApplicationRequestRouting' }
if ($hasArr) {
    Write-Host '[1] ARR presente.' -ForegroundColor DarkGray
} else {
    Write-Host '[1] Installo ARR...' -ForegroundColor Cyan
    $msi = Join-Path $env:TEMP 'requestRouter_amd64.msi'
    Invoke-WebRequest -Uri $ArrMsiUrl -OutFile $msi -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
    # IIS ricarica i moduli: riavvio il servizio web per registrare ARR.
    Restart-Service W3SVC -Force
    Write-Host '    ARR installato.' -ForegroundColor Green
}

# 2) Abilito il proxy ARR a livello server (default: disabilitato).
Write-Host '[2] Abilito il proxy ARR a livello server' -ForegroundColor Cyan
Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' `
    -filter 'system.webServer/proxy' -name 'enabled' -value 'True'
# preserveHostHeader: Plausible valida contro BASE_URL, deve vedere l'host reale.
Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' `
    -filter 'system.webServer/proxy' -name 'preserveHostHeader' -value 'True'

# 3) Sito + web.config reverse proxy.
Write-Host '[3] Creo il sito IIS + web.config' -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $SitePath | Out-Null

# webSocket enabled=false: e' il trick documentato per far gestire l'upgrade
# WS ad ARR invece che al modulo WebSocket di IIS (che altrimenti intercetta
# e rompe il LiveView di Plausible).
$webConfig = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <webSocket enabled="false" />
    <rewrite>
      <rules>
        <rule name="ReverseProxyToPlausible" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://localhost:$UpstreamPort/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
"@
# WriteAllText con UTF8 senza BOM (IIS non ama il BOM nel web.config).
[System.IO.File]::WriteAllText((Join-Path $SitePath 'web.config'), $webConfig, (New-Object System.Text.UTF8Encoding($false)))

if (Get-Website -Name $SiteName -ErrorAction SilentlyContinue) {
    Write-Host '    Sito esistente, aggiorno il binding' -ForegroundColor DarkGray
} else {
    New-Website -Name $SiteName -PhysicalPath $SitePath -HostHeader $Fqdn -Port 80 | Out-Null
    Write-Host '    Sito creato (HTTP 80).' -ForegroundColor Green
}
$siteId = (Get-Website -Name $SiteName).Id

# 4) Certificato + 443 via win-acme (unattended).
Write-Host '[4] Emetto il certificato con win-acme e creo il binding 443' -ForegroundColor Cyan
if (-not (Test-Path $WacsPath)) { throw "win-acme non trovato in $WacsPath" }
# --source iis --siteid: win-acme legge il binding HTTP, valida via http-01,
# installa il cert e crea/aggiorna il binding HTTPS sullo stesso sito.
& $WacsPath --source iis --siteid $siteId --host $Fqdn `
    --installation iis --store certificatestore `
    --accepttos --emailaddress 'licensing@wuic-framework.com' 2>&1 | Write-Host

# Redirect http->https a livello di sito.
Write-Host '[4b] Aggiungo il redirect http->https' -ForegroundColor Cyan
$redirectRule = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <webSocket enabled="false" />
    <rewrite>
      <rules>
        <rule name="ForceHttps" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="off" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
        </rule>
        <rule name="ReverseProxyToPlausible" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://localhost:$UpstreamPort/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
"@
[System.IO.File]::WriteAllText((Join-Path $SitePath 'web.config'), $redirectRule, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host "FASE 3 completata. Apri https://$Fqdn e crea il primo utente admin." -ForegroundColor Green
Write-Host 'Poi metti DISABLE_REGISTRATION=true in /opt/plausible/plausible-conf.env (WSL) e riavvia i container:' -ForegroundColor Yellow
Write-Host '  wsl -d UbuntuAnalytics -u root -- sh -c "cd /opt/plausible && docker compose up -d"' -ForegroundColor Gray
