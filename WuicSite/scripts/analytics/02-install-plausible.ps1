<#
.SYNOPSIS
    Plausible self-hosted — FASE 2 (automatica come SYSTEM dopo il reboot).

.DESCRIPTION
    Registrata dalla fase 1 come scheduled task SYSTEM @startup. Idempotente:
    se rilanciata, salta i passi gia' fatti. A fine corsa si de-registra e
    lascia attivo solo il keep-alive.

      1. Attende la rete.
      2. wsl --update (kernel) + set default version 2.
      3. Importa la distro UbuntuAnalytics dal rootfs (se non esiste).
      4. Scrive /etc/wsl.conf (systemd on, utente root) e riavvia la distro.
      5. Copia bootstrap + compose + env dentro la distro ed esegue il
         bootstrap (Docker + Plausible up).
      6. Registra il keep-alive @startup (SYSTEM) che tiene viva la distro.
      7. Si de-registra (task WuicAnalyticsPhase2).

    Tutto gira come SYSTEM: la distro e il keep-alive vivono nello stesso
    contesto, niente credenziali salvate.
#>
[CmdletBinding()]
param(
    [string]$WorkDir  = 'C:\wuic-analytics',
    [string]$Distro   = 'UbuntuAnalytics',
    [string]$DistroDir = 'C:\wsl\UbuntuAnalytics'
)

$ErrorActionPreference = 'Stop'
$log = Join-Path $WorkDir 'phase2.log'
function Log($m) {
    $line = "{0}  {1}" -f ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')), $m
    Add-Content -Path $log -Value $line
    Write-Host $line
}

try {
    Log '=== FASE 2 avviata (SYSTEM) ==='

    # 1) Attendo la rete: al boot il DNS/rete puo' non essere pronto.
    Log '[1] Attendo la rete...'
    for ($i = 0; $i -lt 60; $i++) {
        if (Test-Connection -ComputerName '1.1.1.1' -Count 1 -Quiet) { break }
        Start-Sleep -Seconds 5
    }

    # 2) Kernel WSL2 + default v2.
    Log '[2] wsl --update + default version 2'
    & wsl.exe --update --web-download 2>&1 | ForEach-Object { Log "    $_" }
    & wsl.exe --set-default-version 2  2>&1 | ForEach-Object { Log "    $_" }

    # 3) Import distro (idempotente).
    $existing = (& wsl.exe --list --quiet) -join "`n"
    if ($existing -match [regex]::Escape($Distro)) {
        Log "[3] Distro $Distro gia' presente, salto l'import"
    } else {
        Log "[3] Importo $Distro da rootfs"
        New-Item -ItemType Directory -Force -Path $DistroDir | Out-Null
        & wsl.exe --import $Distro $DistroDir (Join-Path $WorkDir 'ubuntu-rootfs.tar.gz') --version 2 2>&1 | ForEach-Object { Log "    $_" }
    }

    # 4) wsl.conf: systemd on (per far partire dockerd come servizio) + root default.
    Log '[4] Configuro /etc/wsl.conf (systemd on)'
    $wslConf = "[boot]`nsystemd=true`n`n[user]`ndefault=root`n"
    # Scrivo via bash per gestire i permessi/EOL Unix correttamente.
    $wslConf | & wsl.exe -d $Distro -u root -- tee /etc/wsl.conf | Out-Null
    & wsl.exe --terminate $Distro 2>&1 | ForEach-Object { Log "    $_" }
    Start-Sleep -Seconds 3

    # 5) Copio i file e lancio il bootstrap dentro la distro.
    #    /mnt/c espone C:\ dentro WSL: passo i path Windows convertiti.
    Log '[5] Eseguo il bootstrap (Docker + Plausible) dentro la distro'
    $wslWork = '/mnt/c/wuic-analytics'
    # Normalizzo gli EOL a LF e rendo eseguibile il bootstrap.
    & wsl.exe -d $Distro -u root -- bash -c "sed -i 's/\r$//' $wslWork/wsl-bootstrap.sh && chmod +x $wslWork/wsl-bootstrap.sh && $wslWork/wsl-bootstrap.sh 2>&1" 2>&1 | ForEach-Object { Log "    $_" }

    # 6) Keep-alive: tiene su la distro (e quindi systemd+docker+containers)
    #    per tutta la vita del server. Senza, WSL termina la distro dopo pochi
    #    secondi di idle.
    Log '[6] Registro il keep-alive @startup (SYSTEM)'
    $kaAction = New-ScheduledTaskAction -Execute 'wsl.exe' `
        -Argument "-d $Distro -u root -e sh -c `"sleep infinity`""
    $kaTrigger   = New-ScheduledTaskTrigger -AtStartup
    $kaPrincipal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    # ExecutionTimeLimit 0 = illimitato: il task DEVE restare vivo per sempre.
    $kaSettings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName 'WuicAnalyticsKeepWSL' -Action $kaAction -Trigger $kaTrigger `
        -Principal $kaPrincipal -Settings $kaSettings -Force | Out-Null
    # Lo avvio subito (non aspetto il prossimo reboot).
    Start-ScheduledTask -TaskName 'WuicAnalyticsKeepWSL'
    Log '    keep-alive attivo.'

    # 7) Health check locale: Plausible su :8000.
    Log '[7] Health check localhost:8000'
    Start-Sleep -Seconds 20
    $up = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $r = Invoke-WebRequest -Uri 'http://localhost:8000/api/health' -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { $up = $true; break }
        } catch { }
        Start-Sleep -Seconds 10
    }
    Log ("    Plausible " + $(if ($up) { 'RISPONDE su :8000' } else { 'NON risponde ancora (i container ClickHouse impiegano qualche minuto la prima volta — ricontrolla)' }))

    # 8) De-registro la fase 2 (one-shot).
    Log '[8] De-registro WuicAnalyticsPhase2'
    Unregister-ScheduledTask -TaskName 'WuicAnalyticsPhase2' -Confirm:$false

    Log '=== FASE 2 completata. Prossimo passo: 03-iis-reverse-proxy.ps1 (manuale) ==='
}
catch {
    Log "ERRORE FASE 2: $($_.Exception.Message)"
    Log $_.ScriptStackTrace
    # NON de-registro il task in caso di errore: al prossimo reboot ritenta.
    throw
}
