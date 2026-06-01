<#
.SYNOPSIS
    Registers 3 Windows Scheduled Tasks for WUIC daily community reminders.

.DESCRIPTION
    Idempotent installer (uses -Force on Register-ScheduledTask). Creates:
      - WUIC-DevTo-Reminder    fires daily at 09:00 (devto crosspost)
      - WUIC-LinkedIn-Reminder fires daily at 09:30 (LinkedIn post)
      - WUIC-SO-Triage         fires daily at 18:00 (Stack Overflow scan)

    All tasks run as the current Interactive user (NOT SYSTEM) so toast
    notifications surface on the user's desktop. They use pwsh.exe (PS7+)
    per AGENTS.md rule 27.

.NOTES
    Re-run safely any time — Register-ScheduledTask -Force overwrites.
    To remove the tasks: .\uninstall-tasks.ps1
    To test manually:    pwsh -File .\wuic-reminder.ps1 -Type devto
#>

$ErrorActionPreference = 'Stop'
$ReminderScript = Join-Path $PSScriptRoot 'wuic-reminder.ps1'

if (-not (Test-Path $ReminderScript)) {
    Write-Host "[error] wuic-reminder.ps1 not found at $ReminderScript" -ForegroundColor Red
    exit 1
}

# Resolve pwsh.exe location. AGENTS.md rule 27: NEVER use powershell.exe (5.1),
# the reminder script uses PS7+ syntax (null-coalesce, ternary in places).
$Pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $Pwsh) {
    Write-Host "[error] pwsh.exe (PowerShell 7+) not found on PATH." -ForegroundColor Red
    Write-Host "[error] Install from: https://aka.ms/powershell" -ForegroundColor Red
    exit 1
}

$Tasks = @(
    @{ Name = 'WUIC-DevTo-Reminder';    Time = '09:00'; Type = 'devto';
       Desc = 'WUIC dev.to crosspost reminder — opens the next ☐ article from MANIFEST.md' },
    @{ Name = 'WUIC-LinkedIn-Reminder'; Time = '09:30'; Type = 'linkedin';
       Desc = 'WUIC LinkedIn daily post reminder — opens posts.md at today section' },
    @{ Name = 'WUIC-SO-Triage';         Time = '18:00'; Type = 'so';
       Desc = 'WUIC Stack Overflow triage — scans SE API for unanswered candidates' }
)

foreach ($t in $Tasks) {
    # Argument string: -NoProfile + -WindowStyle Hidden ensures no console flash.
    # -ExecutionPolicy Bypass needed because the .ps1 isn't signed.
    $argString = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ReminderScript`" -Type $($t.Type)"

    $action = New-ScheduledTaskAction -Execute $Pwsh -Argument $argString

    # Daily trigger at the specified local-time. Windows interprets this as
    # the user's current timezone (Europe/Rome here), so DST shifts are
    # handled automatically — no manual UTC math needed.
    $trigger = New-ScheduledTaskTrigger -Daily -At $t.Time

    # Settings: StartWhenAvailable so missed runs (laptop sleep) fire at wake.
    # AllowStartIfOnBatteries so it works on laptop without AC.
    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

    # Principal: Interactive logon so the toast renders on desktop. Running
    # as SYSTEM would fire silently because SYSTEM has no UI session.
    $principal = New-ScheduledTaskPrincipal `
        -UserId $env:USERNAME `
        -LogonType Interactive `
        -RunLevel Limited

    Register-ScheduledTask `
        -TaskName $t.Name `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description $t.Desc `
        -Force | Out-Null

    Write-Host "[ok] Registered: $($t.Name) → daily $($t.Time) → -Type $($t.Type)" -ForegroundColor Green
}

Write-Host ""
Write-Host "All 3 tasks registered. Verify with:" -ForegroundColor Cyan
Write-Host "  Get-ScheduledTask -TaskName 'WUIC-*' | Format-Table TaskName, State, @{N='NextRun';E={(Get-ScheduledTaskInfo `$_).NextRunTime}}" -ForegroundColor Gray
Write-Host ""
Write-Host "Test the toast manually right now:" -ForegroundColor Cyan
Write-Host "  pwsh -NoProfile -ExecutionPolicy Bypass -File `"$ReminderScript`" -Type devto" -ForegroundColor Gray
Write-Host ""
Write-Host "(First run will install BurntToast PS module to CurrentUser scope — ~10s)" -ForegroundColor DarkGray
