<#
.SYNOPSIS
    WUIC daily reminder — fires a Windows Toast notification with the
    actionable info for the day's dev.to crosspost, LinkedIn post, or
    Stack Overflow triage.

.DESCRIPTION
    Local-only fallback for the cloud-side claude.ai routines, which
    output to the routines page but don't reliably deliver email
    notifications (the "Email da Claude Code sul web" toggle is for
    build/PR completion, not for routine output). This script runs as
    a Windows Scheduled Task at 09:00 / 09:30 / 18:00 and pops a native
    Toast that links directly to the file to paste OR the URL to open.

    Smart behavior:
      - devto:   reads cross-posts/devto/MANIFEST.md, finds the next ☐
                 row, extracts slug + title, builds a toast pointing at
                 the local .md file. Stops when the manifest is all ✅.
      - linkedin: reads community/linkedin/posts.md, finds the section
                 matching today's date (## Day N — YYYY-MM-DD), opens
                 the file in default editor for the operator to copy.
      - so:      runs scripts/so-candidates.mjs (Stack Exchange API),
                 parses the JSON, summarizes the top candidate or says
                 "no candidates today".

.PARAMETER Type
    devto | linkedin | so

.EXAMPLE
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\wuic-reminder.ps1 -Type devto

.NOTES
    Requires the BurntToast PowerShell module for native Win10/11 toast
    notifications. The script auto-installs it on first run (CurrentUser
    scope, no admin required).
#>
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('devto','linkedin','so')]
    [string]$Type
)

$ErrorActionPreference = 'Stop'
$WuicSite = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

# ── BurntToast auto-install ──────────────────────────────────────────
# BurntToast wraps the WinRT ToastNotificationManager API. Without it
# we'd have to register a custom AUMID + build XML payloads by hand,
# which is brittle and silent-fails when the AUMID isn't registered.
# Install on first run, scope=CurrentUser so no admin elevation.
if (-not (Get-Module -ListAvailable -Name BurntToast)) {
    Write-Host "[setup] Installing BurntToast (first-run only)..." -ForegroundColor DarkGray
    try {
        Install-Module BurntToast -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "[error] BurntToast install failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "[error] Try manually: Install-Module BurntToast -Scope CurrentUser" -ForegroundColor Red
        exit 1
    }
}
Import-Module BurntToast -ErrorAction Stop

# Brand icon for the toast (square PNG, will be cropped to circle by Windows).
$WuicIcon = Join-Path $WuicSite 'public\assets\brand\png\wuic-icon-w-faceted-128.png'
if (-not (Test-Path $WuicIcon)) { $WuicIcon = $null }

function Show-Reminder {
    param(
        [string]$Title,
        [string]$Body,
        [string]$FilePath = $null,
        [string]$Url = $null
    )

    # Build optional action buttons. Windows lets the user dismiss the
    # toast OR click a button to launch a file/URL. We use 'Protocol'
    # activation: Windows resolves file:// paths to the default editor
    # and https:// to the default browser.
    $buttons = @()
    if ($FilePath -and (Test-Path $FilePath)) {
        # `file:///` prefix is required for the Protocol activation to
        # actually open the file with the default associated app instead
        # of failing silently.
        $fileUri = 'file:///' + ($FilePath -replace '\\','/' -replace ' ','%20')
        $buttons += New-BTButton -Content 'Open file' -Arguments $fileUri -ActivationType Protocol
    }
    if ($Url) {
        $buttons += New-BTButton -Content 'Open URL' -Arguments $Url -ActivationType Protocol
    }

    $params = @{
        Text    = @($Title, $Body)
    }
    if ($WuicIcon) { $params['AppLogo'] = $WuicIcon }
    if ($buttons.Count -gt 0) { $params['Button'] = $buttons }

    New-BurntToastNotification @params
}

$Today = (Get-Date).ToString('yyyy-MM-dd')

switch ($Type) {
    'devto' {
        # ── dev.to crosspost reminder ─────────────────────────────────
        # Find the next unchecked (☐) row in MANIFEST.md. Each row looks like:
        #   | ☐ | [Title](https://wuic-framework.com/blog/<slug>) | `tags` | [file.md](file.md) |
        # We extract the URL + slug, then build the local .md file path.
        $manifestPath = Join-Path $WuicSite 'cross-posts\devto\MANIFEST.md'
        if (-not (Test-Path $manifestPath)) {
            Show-Reminder "📝 WUIC dev.to" "MANIFEST.md not found at $manifestPath"
            return
        }
        $manifest = Get-Content $manifestPath -Raw
        $rowMatch = [regex]::Match(
            $manifest,
            '\|\s*☐\s*\|\s*\[(?<title>[^\]]+)\]\(https://wuic-framework\.com/blog/(?<slug>[^)]+)\)\s*\|'
        )
        if (-not $rowMatch.Success) {
            Show-Reminder "🎉 WUIC dev.to" "All 10 articles published! You can disable the daily reminder task."
            return
        }
        $slug = $rowMatch.Groups['slug'].Value
        $title = $rowMatch.Groups['title'].Value
        $filePath = Join-Path $WuicSite "cross-posts\devto\$slug.md"
        $titleShort = if ($title.Length -gt 70) { $title.Substring(0, 67) + '...' } else { $title }
        Show-Reminder `
            -Title "📝 dev.to crosspost today" `
            -Body  "$titleShort`n→ Paste content from $slug.md into dev.to/new" `
            -FilePath $filePath `
            -Url 'https://dev.to/new'
    }

    'linkedin' {
        # ── LinkedIn daily post reminder ──────────────────────────────
        # Open the posts.md file at the section matching today's date.
        # The header pattern is: ## Day N — YYYY-MM-DD (topic)
        $postsPath = Join-Path $WuicSite 'community\linkedin\posts.md'
        if (-not (Test-Path $postsPath)) {
            Show-Reminder "📣 WUIC LinkedIn" "posts.md not found at $postsPath"
            return
        }
        $content = Get-Content $postsPath -Raw
        $todayHeader = [regex]::Match($content, "## Day (?<n>\d+)\s+—\s+$Today\s+\((?<topic>[^)]+)\)")
        if ($todayHeader.Success) {
            $day = $todayHeader.Groups['n'].Value
            $topic = $todayHeader.Groups['topic'].Value
            Show-Reminder `
                -Title "📣 LinkedIn post — Day $day of 10" `
                -Body  "$topic`n→ Find '## Day $day' in posts.md, copy block, paste on LinkedIn" `
                -FilePath $postsPath `
                -Url 'https://www.linkedin.com/feed/'
        } else {
            Show-Reminder `
                -Title "📣 WUIC LinkedIn" `
                -Body  "No specific post for $Today. Open posts.md to pick a background one (Demo / Thought leadership / Engineering retro)." `
                -FilePath $postsPath `
                -Url 'https://www.linkedin.com/feed/'
        }
    }

    'so' {
        # ── Stack Overflow daily triage ───────────────────────────────
        # Run the existing JS script that queries Stack Exchange API.
        # Parse the JSON output, summarize the top candidate (or "none").
        $node = "$env:APPDATA\nvm\v24.14.0\node.exe"
        if (-not (Test-Path $node)) { $node = "node" }
        $script = Join-Path $WuicSite 'scripts\so-candidates.mjs'
        if (-not (Test-Path $script)) {
            Show-Reminder "🔍 WUIC SO" "so-candidates.mjs not found at $script"
            return
        }
        try {
            $raw = & $node $script 2>&1 | Out-String
            $json = $raw | ConvertFrom-Json -ErrorAction Stop
        } catch {
            Show-Reminder "🔍 SO triage" "Script error: $($_.Exception.Message)"
            return
        }
        $count = [int]$json.candidates_count
        if ($count -gt 0) {
            $top = $json.candidates[0]
            $titleShort = if ($top.title.Length -gt 90) { $top.title.Substring(0, 87) + '...' } else { $top.title }
            $status = if ($top.is_answered) { 'answered' } else { 'unanswered' }
            Show-Reminder `
                -Title "🔍 SO triage — $count candidate(s) in last 14d" `
                -Body  "Top: $titleShort`n($status, $($top.answers) answers, $($top.age_days)d, template $($top.template_hint))" `
                -Url $top.link
        } else {
            Show-Reminder `
                -Title "🔍 SO triage" `
                -Body  "No fresh candidates today. Next scan tomorrow 18:00."
        }
    }
}
