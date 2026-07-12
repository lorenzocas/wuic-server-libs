<#
.SYNOPSIS
    Plausible self-hosted su wuic-framework.com — FASE 1 (interattiva, riavvia).

.DESCRIPTION
    Il VPS e' Windows Server 2025 senza Docker: Plausible (app Elixir +
    ClickHouse + Postgres) gira dentro WSL2/Ubuntu. Abilitare WSL2 richiede
    due feature Windows + un riavvio, quindi il setup e' spezzato in 3 fasi:

      FASE 1 (questo script, interattivo, come Administrator):
        - scarica e VALIDA il rootfs Ubuntu + il kernel WSL *prima* di toccare
          il sistema (se il download fallisce NON si riavvia niente);
        - abilita le feature Microsoft-Windows-Subsystem-Linux + VirtualMachinePlatform;
        - registra la FASE 2 come scheduled task SYSTEM @startup (one-shot);
        - RIAVVIA il server.

      FASE 2 (02-install-plausible.ps1, automatica come SYSTEM dopo il reboot):
        importa Ubuntu, installa Docker, tira su Plausible, registra il
        keep-alive, si de-registra da sola.

      FASE 3 (03-iis-reverse-proxy.ps1, interattiva, dopo aver verificato che
        Plausible risponde su localhost:8000): installa ARR, crea il sito IIS
        analytics.wuic-framework.com, emette il certificato con win-acme.

    Perche' SYSTEM per la fase 2: le distro WSL sono per-utente. Installandola
    e tenendola viva sotto NT AUTHORITY\SYSTEM, il keep-alive @startup non ha
    bisogno di credenziali salvate e sopravvive al logoff — che e' esattamente
    cio' che serve a un servizio headless su un server.

.NOTES
    Eseguire come Administrator sul VPS. Il riavvio butta giu' per ~2-3 min
    TUTTI i siti IIS (sito pubblico, demo, forum, crash receiver): lanciarlo
    in una finestra a basso traffico. Nessun riavvio automatico ricorrente —
    e' un one-shot esplicito richiesto dall'operatore.
#>
[CmdletBinding()]
param(
    # Cartella di lavoro persistente (sopravvive al reboot, usata dalla fase 2).
    [string]$WorkDir = 'C:\wuic-analytics',

    # Candidati per il rootfs Ubuntu WSL. Si prova il primo che risponde 200.
    # Override se Canonical cambia i path.
    [string[]]$RootfsUrlCandidates = @(
        # Path verificato 2026-07 (~340MB). Canonical pubblica i rootfs WSL
        # sotto /wsl/releases/<ver>/current/ — NON piu' sotto /wsl/<codename>/.
        'https://cloud-images.ubuntu.com/wsl/releases/24.04/current/ubuntu-noble-wsl-amd64-24.04lts.rootfs.tar.gz',
        'https://cloud-images.ubuntu.com/wsl/releases/24.04/current/ubuntu-noble-wsl-amd64-wsl.rootfs.tar.gz'
    ),

    # Salta il reboot finale (per un dry-run che scarica e abilita soltanto).
    [switch]$NoReboot
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Esegui questo script come Administrator.'
    }
}

Assert-Admin
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
$log = Join-Path $WorkDir 'phase1.log'
Start-Transcript -Path $log -Append | Out-Null

try {
    $srcDir = $PSScriptRoot
    Write-Host "[1/5] Preparo i file di setup in $WorkDir (sorgente: $srcDir)" -ForegroundColor Cyan
    # I file devono vivere in $WorkDir perche' la fase 2 (dopo il reboot) li
    # cerca la' con path ASSOLUTI. Due casi:
    #   a) hai gia' fatto scp della cartella direttamente in C:\wuic-analytics
    #      -> $srcDir == $WorkDir, non c'e' niente da copiare.
    #   b) stai lanciando lo script da un'altra cartella -> copio i sibling.
    $srcFull  = (Resolve-Path $srcDir).Path.TrimEnd('\')
    $workFull = (Resolve-Path $WorkDir).Path.TrimEnd('\')
    if ($srcFull -ieq $workFull) {
        Write-Host '  gli script sono gia in ' $WorkDir ', nessuna copia necessaria' -ForegroundColor DarkGray
    } else {
        foreach ($item in @('02-install-plausible.ps1', 'wsl-bootstrap.sh', 'plausible')) {
            $s = Join-Path $srcDir $item
            if (-not (Test-Path $s)) { throw "File mancante nella cartella di setup: $s. Hai copiato TUTTA la cartella scripts/analytics?" }
            Copy-Item -Path $s -Destination $WorkDir -Recurse -Force
        }
    }
    # Verifica dura: se manca uno di questi, la fase 2 fallirebbe dopo il reboot.
    foreach ($need in @('02-install-plausible.ps1', 'wsl-bootstrap.sh', 'plausible\docker-compose.yml', 'plausible\plausible-conf.env.sample')) {
        $p = Join-Path $WorkDir $need
        if (-not (Test-Path $p)) { throw "Manca $p dopo la preparazione. Interrompo PRIMA del reboot." }
    }
    Write-Host '  file di setup verificati.' -ForegroundColor Green

    Write-Host '[2/5] Scarico e valido il rootfs Ubuntu (PRIMA di toccare il sistema)' -ForegroundColor Cyan
    $rootfs = Join-Path $WorkDir 'ubuntu-rootfs.tar.gz'
    if ((Test-Path $rootfs) -and ((Get-Item $rootfs).Length -gt 100MB)) {
        Write-Host '  rootfs presente e maggiore di 100MB, salto il download' -ForegroundColor DarkGray
    } else {
        $ok = $false
        foreach ($url in $RootfsUrlCandidates) {
            try {
                Write-Host "  provo: $url" -ForegroundColor DarkGray
                # HEAD prima, per non scaricare 400MB da un URL sbagliato.
                $head = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 30
                if ($head.StatusCode -eq 200) {
                    Invoke-WebRequest -Uri $url -OutFile $rootfs -UseBasicParsing -TimeoutSec 900
                    if ((Get-Item $rootfs).Length -gt 100MB) { $ok = $true; break }
                }
            } catch {
                Write-Host "    ko ($($_.Exception.Message))" -ForegroundColor DarkYellow
            }
        }
        if (-not $ok) {
            throw "Nessun URL rootfs valido. Passa -RootfsUrlCandidates con un link corretto e rilancia. NIENTE e' stato modificato, nessun reboot."
        }
    }
    # Registra l'URL scelto in un file che la fase 2 non usa (solo audit).
    "rootfs=$rootfs (size $((Get-Item $rootfs).Length))" | Set-Content (Join-Path $WorkDir 'rootfs.info')
    Write-Host '  rootfs OK.' -ForegroundColor Green

    Write-Host '[3/5] Aggiorno/installo il kernel WSL2 (web-download)' -ForegroundColor Cyan
    # Su Server il kernel WSL2 va tirato via web (niente Store). Puo' fallire
    # se le feature non sono ancora attive: e' tollerato, si ritenta in fase 2.
    try { & wsl.exe --update --web-download 2>&1 | Write-Host } catch { Write-Host "  wsl --update rimandato alla fase 2 ($($_.Exception.Message))" -ForegroundColor DarkYellow }

    Write-Host '[4/5] Abilito le feature WSL + VirtualMachinePlatform (no restart)' -ForegroundColor Cyan
    # dism e' piu' robusto di Enable-WindowsOptionalFeature su Server core-ish.
    & dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
    & dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null
    Write-Host '  feature abilitate (attive dopo il reboot).' -ForegroundColor Green

    Write-Host '[5/5] Registro la FASE 2 come task SYSTEM @startup (one-shot)' -ForegroundColor Cyan
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$WorkDir\02-install-plausible.ps1`""
    $trigger   = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 3)
    Register-ScheduledTask -TaskName 'WuicAnalyticsPhase2' -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host '  task WuicAnalyticsPhase2 registrato.' -ForegroundColor Green

    Write-Host ''
    Write-Host 'FASE 1 completata. Al riavvio, la fase 2 gira da sola come SYSTEM.' -ForegroundColor Green
    Write-Host 'Segui i log post-reboot con:  Get-Content C:\wuic-analytics\phase2.log -Wait' -ForegroundColor Gray

    if ($NoReboot) {
        Write-Host 'NoReboot: riavvia manualmente per far partire la fase 2.' -ForegroundColor Yellow
    } else {
        Write-Host 'Riavvio tra 15 secondi (Ctrl+C per annullare)...' -ForegroundColor Yellow
        Start-Sleep -Seconds 15
        Restart-Computer -Force
    }
}
finally {
    Stop-Transcript | Out-Null
}
