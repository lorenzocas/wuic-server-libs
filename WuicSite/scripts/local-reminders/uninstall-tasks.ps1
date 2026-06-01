<#
.SYNOPSIS
    Removes the 3 WUIC daily reminder Scheduled Tasks.

.NOTES
    Does NOT uninstall the BurntToast PS module — it might be in use by
    other scripts. Remove manually with: Uninstall-Module BurntToast
#>

$ErrorActionPreference = 'Continue'
$Tasks = @('WUIC-DevTo-Reminder', 'WUIC-LinkedIn-Reminder', 'WUIC-SO-Triage')

foreach ($name in $Tasks) {
    $existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $name -Confirm:$false
        Write-Host "[ok] Removed: $name" -ForegroundColor Green
    } else {
        Write-Host "[skip] Not registered: $name" -ForegroundColor DarkGray
    }
}
