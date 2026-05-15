<#
.SYNOPSIS
  Rinomina il progetto WuicTest in un nome custom.
  Aggiorna assembly, namespace, Angular, VS Code launcher e configurazioni.

.PARAMETER Name
  Nome del progetto in PascalCase (es. "MioProgetto", "AcmeApp").
  Deve iniziare con lettera e contenere solo lettere e cifre.

.PARAMETER InPlace
  Se specificato, rinomina direttamente nella cartella corrente (incluso il
  nome della cartella stessa). Senza questo flag, clona prima la cartella
  in una copia con il nuovo nome e applica le modifiche sulla copia.

.EXAMPLE
  # Clona WuicTest → AcmeApp (cartella nuova, originale intatto)
  pwsh rename-project.ps1 -Name "AcmeApp"

  # Rinomina in-place (modifica la cartella corrente)
  pwsh rename-project.ps1 -Name "AcmeApp" -InPlace
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [switch]$InPlace,
    # Porta backend .NET della nuova app. Default :5100 (convenzione skill
    # app-creation). Questo aggiorna proxy.conf.json/proxy.conf.js e
    # launchSettings.json del nuovo progetto cosi' frontend (`ng serve`)
    # e backend (`dotnet run`) parlano correttamente fin dal primo run
    # senza che l'utente debba toccare il proxy a mano (problema verificato
    # 2026-05-05: tutti i test UI fallivano con "Credenziali non valide"
    # perche' proxy clonato puntava a :5000 = WuicTest backend).
    [int]$BackendPort = 5100
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ── validation ───────────────────────────────────────────────────────

if ($Name -notmatch '^[A-Z][a-zA-Z0-9]+$') {
    Write-Host "ERRORE: il nome deve essere PascalCase, iniziare con maiuscola e contenere solo lettere/cifre." -ForegroundColor Red
    Write-Host "  Esempio: pwsh rename-project.ps1 -Name 'AcmeApp'" -ForegroundColor Yellow
    exit 1
}

if ($Name -eq 'WuicTest') {
    Write-Host "Il progetto si chiama gia' WuicTest — nulla da fare." -ForegroundColor Yellow
    exit 0
}

# ── derive variants ──────────────────────────────────────────────────

$pascal = $Name  # es. "AcmeApp"

# PascalCase → kebab-case: inserisci "-" prima di ogni maiuscola (tranne la prima), poi lowercase
$kebab = ($pascal -creplace '([A-Z])', '-$1').TrimStart('-').ToLower()  # es. "acme-app"

$oldPascal = 'WuicTest'
$oldKebab  = 'wuic-test'

# ── resolve source root ─────────────────────────────────────────────

$sourceRoot = $PSScriptRoot
# Se lo script e' in scripts/, risali alla root del progetto
if ((Split-Path $sourceRoot -Leaf) -eq 'scripts') {
    $sourceRoot = Split-Path $sourceRoot -Parent
}

$csprojCheck = Join-Path $sourceRoot "$oldPascal.csproj"
if (-not (Test-Path $csprojCheck)) {
    Write-Host "ERRORE: $csprojCheck non trovato. Esegui questo script dalla root del progetto." -ForegroundColor Red
    exit 1
}

# ── clone or in-place ────────────────────────────────────────────────

if ($InPlace) {
    $projectRoot = $sourceRoot
    Write-Host ""
    Write-Host "Modalita': IN-PLACE (modifica diretta)" -ForegroundColor Yellow
} else {
    $parentDir = Split-Path $sourceRoot -Parent
    $cloneDir = Join-Path $parentDir $pascal
    if (Test-Path $cloneDir) {
        Write-Host "ERRORE: la cartella $cloneDir esiste gia'. Rimuovila o usa -InPlace." -ForegroundColor Red
        exit 1
    }
    Write-Host ""
    Write-Host "Clonazione $sourceRoot -> $cloneDir ..." -ForegroundColor Cyan

    # Copia escludendo artefatti pesanti/rigenerabili
    $excludeDirs = @('node_modules', '.angular', 'dist', 'bin', 'obj')
    $sourceLeaf = Split-Path $sourceRoot -Leaf

    # robocopy per performance su cartelle grandi. /E = ricorsivo, /XD = escludi dir.
    # robocopy exit code 0-7 = successo, >=8 = errore.
    # /XJ = NON seguire junctions/symlinks — fondamentale per `wwwroot/lib-src`
    # che e' un junction verso `KonvergenceCore/wwwroot/my-workspace/projects/
    # wuic-framework-lib/src/lib`. Senza /XJ, robocopy copia il CONTENUTO
    # della lib framework dentro il nuovo progetto, creando una copia stale
    # che divergera' subito dalla fonte. Verificato 2026-05-05.
    $robocopyArgs = @($sourceRoot, $cloneDir, '/E', '/XJ', '/NJH', '/NJS', '/NFL', '/NDL', '/NC', '/NS', '/NP')
    foreach ($d in $excludeDirs) {
        $robocopyArgs += '/XD'
        $robocopyArgs += $d
    }
    & robocopy @robocopyArgs | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy fallito con exit code $LASTEXITCODE"
    }

    Write-Host "  Clonata (esclusi: $($excludeDirs -join ', '))" -ForegroundColor Green
    $projectRoot = $cloneDir

    # Ricrea il junction `wwwroot/lib-src` -> framework lib di KonvergenceCore.
    # In WuicTest e' un junction; robocopy con /XJ lo salta (non lo copia
    # come dir), quindi nel nuovo progetto il path NON esiste finche' non
    # lo ricreiamo qui. Senza questo, `lib-src` e' assente e i tsconfig
    # alias `wuic-framework-lib-src/*` -> `./lib-src/*` puntano nel vuoto
    # → build TypeScript fallisce con "Cannot find module".
    #
    # Junction (no admin) invece di SymbolicLink (richiede admin/dev mode):
    # equivalente per directory linking sullo stesso volume.
    $libSrcPath = Join-Path $projectRoot 'wwwroot\lib-src'
    $libSrcTarget = Join-Path (Split-Path $sourceRoot -Parent) 'KonvergenceCore\wwwroot\my-workspace\projects\wuic-framework-lib\src\lib'
    if (-not (Test-Path $libSrcTarget)) {
        # Fallback: se sourceRoot e' WuicTest (default), il sibling KonvergenceCore
        # dovrebbe esserci. Se manca, warning e skip — l'utente ricreera' a mano.
        Write-Host "  [warn] $libSrcTarget non trovato; junction lib-src NON ricreato." -ForegroundColor Yellow
    } else {
        if (Test-Path $libSrcPath) {
            Remove-Item -Path $libSrcPath -Recurse -Force -ErrorAction SilentlyContinue
        }
        & cmd /c "mklink /J `"$libSrcPath`" `"$libSrcTarget`"" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Junction: wwwroot/lib-src -> $libSrcTarget" -ForegroundColor DarkGray
        } else {
            Write-Host "  [warn] mklink /J fallito (code=$LASTEXITCODE). Crea manualmente con: cmd /c mklink /J `"$libSrcPath`" `"$libSrcTarget`"" -ForegroundColor Yellow
        }
    }

    # Aggiungi `wwwroot/lib-src` al `.gitignore` della nuova app: e' un
    # junction al framework lib di KC, vive nel suo repo originale, NON
    # va tracciato nel repo della FE app. Senza questa entry il monorepo
    # del workspace finisce per committare 400+ file framework (verificato
    # 2026-05-05: drift silenzioso sul branch).
    $gitignorePath = Join-Path $projectRoot '.gitignore'
    if (Test-Path $gitignorePath) {
        $gitignoreContent = Get-Content -Path $gitignorePath -Raw -Encoding UTF8
        if ($gitignoreContent -notmatch 'wwwroot/lib-src') {
            $libSrcRule = @"


# wwwroot/lib-src e' un junction verso
# KonvergenceCore/wwwroot/my-workspace/projects/wuic-framework-lib/src/lib
# (regola 16 AGENTS). Vive solo nel repo KC; in questa app NON deve
# essere tracciato. Per distribuzione end-user il junction non serve —
# l'app usera' il pacchetto npm wuic-framework-lib da node_modules.
wwwroot/lib-src
wwwroot/lib-src/**
"@
            Add-Content -Path $gitignorePath -Value $libSrcRule -Encoding UTF8
            Write-Host "  .gitignore: aggiunta regola wwwroot/lib-src" -ForegroundColor DarkGray
        }
    }

    # Pulizia template artifacts: cartelle che contengono dati specifici
    # del template WuicTest (report cities/orders, upload sample, export
    # temporanei) e che NON hanno senso nel nuovo progetto. Le cartelle
    # parent vanno mantenute (l'app le ricrea a runtime), si svuota solo
    # il contenuto.
    $templateArtifactDirs = @(
        @{ Path = 'Reports'; Mode = 'children' },     # cities/, orders/
        @{ Path = 'Upload'; Mode = 'children' },      # uploadsample/, utenti/, file di test
        @{ Path = 'Tmp_export'; Mode = 'children' }   # *.xlsx export demo
    )
    foreach ($a in $templateArtifactDirs) {
        $abs = Join-Path $projectRoot $a.Path
        if (Test-Path $abs) {
            Get-ChildItem -Path $abs -Force -ErrorAction SilentlyContinue | ForEach-Object {
                Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
            Write-Host "  Pulito: $($a.Path)/ (template artifacts)" -ForegroundColor DarkGray
        }
    }

    # Component Angular leftover specifici del template WuicTest:
    # demo "Pattern di sviluppo" (examples/), custom-list di test,
    # field widget demo, ngdeep-showcase, rag-chatbot demo.
    # `unauthorized/` e `exception-handling/` invece sono pagine
    # generiche e vanno preservate.
    $componentLeftoverDirs = @(
        'wwwroot\src\app\component\custom-list',
        'wwwroot\src\app\component\examples',
        'wwwroot\src\app\component\field',
        'wwwroot\src\app\component\ngdeep-showcase-page',
        'wwwroot\src\app\component\rag-chatbot-demo-page'
    )
    foreach ($rel in $componentLeftoverDirs) {
        $abs = Join-Path $projectRoot $rel
        if (Test-Path $abs) {
            Remove-Item -Path $abs -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  Pulito: $rel/ (component template demo)" -ForegroundColor DarkGray
        }
    }

    # app.routes.ts del template referenzia i component leftover sopra.
    # Lo riduciamo a un baseline minimale (solo `unauthorized` + spread
    # `wuicRoutes`) cosi' al primo build TypeScript non lamenta import
    # broken. Il nuovo progetto aggiungera' qui le proprie route custom.
    $routesPath = Join-Path $projectRoot 'wwwroot\src\app\app.routes.ts'
    if (Test-Path $routesPath) {
        $routesBaseline = @"
import { Routes } from '@angular/router';
import { routes as wuicRoutes } from './wuic-bridges/routes';

// Route applicative $pascal.
//
// Tutto il CRUD metadata-driven e' risolto da `wuicRoutes` — non serve
// dichiarare route Angular esplicite. Aggiungi qui SOLO le route che
// richiedono UI custom (livello 2+ della decision-ladder
// app-creation skill) o pagine di sistema (error pages, ecc).

export const appRoutes: Routes = [

  // ──────── Sistema / error pages ────────
  {
    path: 'unauthorized',
    loadComponent: () => import('./component/unauthorized/unauthorized.component')
      .then((m) => m.UnauthorizedComponent),
    data: {
      breadcrumbs: 'unauthorized',
      description: 'Accesso non autorizzato — sessione scaduta o permessi insufficienti. Effettua il login per continuare.'
    }
  },

  // ──────── Route framework metadata-driven (auto-resolve) ────────
  ...wuicRoutes
];
"@
        Set-Content -Path $routesPath -Value $routesBaseline -Encoding UTF8 -NoNewline
        Write-Host "  Reset: app.routes.ts (baseline minimale)" -ForegroundColor DarkGray
    }

    # app.component.ts del template WuicTest referenzia i component leftover
    # appena cancellati (CustomListComponent in particolare). Stripping mirato
    # delle 3 occorrenze note (import, registrazione widgetDefinition,
    # registrazione customDesignerTools), senza riscrivere l'intero file
    # perche' contiene anche bootstrap framework che va preservato.
    #
    # Trappola verificata 2026-05-05: senza questo step, il primo `ng serve`
    # del nuovo progetto fallisce con `Could not resolve "./component/custom-list/custom-list.component"`.
    $appComponentPath = Join-Path $projectRoot 'wwwroot\src\app\app.component.ts'
    if (Test-Path $appComponentPath) {
        $appComponent = Get-Content -Path $appComponentPath -Raw -Encoding UTF8
        $appComponentOriginal = $appComponent

        # 1) Rimuovi import CustomListComponent (se presente)
        $appComponent = $appComponent -replace "(?m)^\s*import\s*\{\s*CustomListComponent\s*\}\s*from\s*'\./component/custom-list/custom-list\.component';\s*\r?\n", ""

        # 2) Rimuovi registrazione widgetDefinition.archetypes['customlist']
        $appComponent = $appComponent -replace "(?m)^\s*MetadataProviderService\.widgetDefinition\.archetypes\['customlist'\]\s*=\s*\{[^}]*\};\s*\r?\n", ""

        # 3) Rimuovi blocco customDesignerComponents/customDesignerTools che usa CustomListComponent
        # (un singolo blocco multiline che termina con `];`)
        $appComponent = [System.Text.RegularExpressions.Regex]::Replace(
            $appComponent,
            "(?ms)^\s*MetadataProviderService\.customDesignerComponents\s*=\s*\[CustomListComponent\];\s*\r?\n\s*MetadataProviderService\.customDesignerTools\s*=\s*\[.*?^\s*\];\s*\r?\n",
            "    MetadataProviderService.customDesignerComponents = [];`r`n    MetadataProviderService.customDesignerTools = [];`r`n",
            [System.Text.RegularExpressions.RegexOptions]::Multiline
        )

        if ($appComponent -ne $appComponentOriginal) {
            Set-Content -Path $appComponentPath -Value $appComponent -Encoding UTF8 -NoNewline
            Write-Host "  Stripped: app.component.ts (CustomListComponent refs)" -ForegroundColor DarkGray
        }
    }

    # FatturaPrintComponent template ha pipe `currency`/`number`/`date` su
    # signal di tipo `Record<string, unknown>` che con `strictTemplates: true`
    # falliscono con TS4111 + TS2769. Wrap dei value access con `$any(...)`
    # per consentire compilazione del template senza modifiche al component.
    # NOTA: questo fix e' specifico del template del custom component
    # `fattura-print` di FatturazioneElettronica e non si applica a tutti
    # i progetti — la nuova app dovrebbe ereditarlo solo se ha questo
    # specifico componente. Per ora left-as-warning: documenta nel runbook.
    # Vedi skill app-creation/SKILL.md sezione "Trappole verificate".
}

Write-Host ""
Write-Host "Rinomina progetto:" -ForegroundColor Cyan
Write-Host "  $oldPascal -> $pascal" -ForegroundColor White
Write-Host "  $oldKebab  -> $kebab" -ForegroundColor White
Write-Host "  Root: $projectRoot" -ForegroundColor DarkGray
Write-Host ""

# ── helpers ──────────────────────────────────────────────────────────

$stats = @{ filesModified = 0; filesRenamed = 0 }

function Replace-InFile {
    param(
        [string]$FilePath,
        [string]$Old,
        [string]$New
    )
    if (-not (Test-Path $FilePath)) { return $false }
    $content = Get-Content -Path $FilePath -Raw -Encoding UTF8
    if ($content -match [regex]::Escape($Old)) {
        $content = $content -replace [regex]::Escape($Old), $New
        Set-Content -Path $FilePath -Value $content -Encoding UTF8 -NoNewline
        return $true
    }
    return $false
}

function Process-File {
    param([string]$RelPath)
    $fullPath = Join-Path $projectRoot $RelPath
    if (-not (Test-Path $fullPath)) {
        Write-Host "  [skip] $RelPath (non trovato)" -ForegroundColor DarkGray
        return
    }
    $changed = $false
    if (Replace-InFile -FilePath $fullPath -Old $oldPascal -New $pascal) { $changed = $true }
    if (Replace-InFile -FilePath $fullPath -Old $oldKebab -New $kebab) { $changed = $true }
    if (Replace-InFile -FilePath $fullPath -Old "${oldKebab}-standalone" -New "${kebab}") { $changed = $true }
    if ($changed) {
        $stats.filesModified++
        Write-Host "  [ok] $RelPath" -ForegroundColor Green
    }
}

# ── step 1: rename .csproj file ─────────────────────────────────────

Write-Host "--- 1/5 Rinomina file .csproj" -ForegroundColor Cyan
$csprojOld = Join-Path $projectRoot "$oldPascal.csproj"
if (Test-Path $csprojOld) {
    Rename-Item -Path $csprojOld -NewName "$pascal.csproj"
    $stats.filesRenamed++
    Write-Host "  [ok] $oldPascal.csproj -> $pascal.csproj" -ForegroundColor Green
}

# ── step 2: rename controller file ──────────────────────────────────

Write-Host "--- 2/5 Rinomina controller" -ForegroundColor Cyan
$ctrlOld = Join-Path $projectRoot "Controllers\${oldPascal}ActionsController.cs"
if (Test-Path $ctrlOld) {
    Rename-Item -Path $ctrlOld -NewName "${pascal}ActionsController.cs"
    $stats.filesRenamed++
    Write-Host "  [ok] ${oldPascal}ActionsController.cs -> ${pascal}ActionsController.cs" -ForegroundColor Green
}

# ── step 3: content replacements ────────────────────────────────────

Write-Host "--- 3/5 Aggiornamento contenuti" -ForegroundColor Cyan

# C# files: ricorsione su tutti i sorgenti del progetto.
# Il template WuicTest ha namespace `WuicTest.Controllers` (e sub) sparsi
# in qualsiasi controller/service. Limitarsi a Program.cs + ActionsController
# lascia fuori SamplesController.cs e qualsiasi altro file aggiunto al
# template, generando build OK ma routing incoerente al runtime.
# IMPORTANTE: il namespace `WEB_UI_CRAFTER` (ProjectData/, Services/, ecc.)
# e' il base namespace del framework, condiviso tra progetti host
# (WuicTest, CrmApp, ...) e NON va rinominato.
$sourceExtensions = @('*.cs', '*.cshtml', '*.razor', '*.razor.cs')
foreach ($ext in $sourceExtensions) {
    $files = Get-ChildItem -Path $projectRoot -Filter $ext -Recurse -File `
        -ErrorAction SilentlyContinue |
        Where-Object {
            # esclusioni: artefatti rigenerabili
            $_.FullName -notmatch '\\(bin|obj|node_modules|\.angular|dist)\\' -and
            $_.Extension -ieq $ext.TrimStart('*')
        }
    foreach ($f in $files) {
        $rel = $f.FullName.Substring($projectRoot.Length).TrimStart('\','/')
        Process-File $rel
    }
}

# Configuration
Process-File "appsettings.json"
Process-File "appsettings.Development.json"

# Backend port: aggiorna proxy.conf.json/proxy.conf.js e launchSettings
# da :5000 (WuicTest default) -> $BackendPort (default :5100). Senza
# questo step, il `ng serve` del nuovo progetto proxia a :5000 dove
# c'e' l'altra app/WuicTest, e tutti i login UI falliscono.
$portFiles = @(
    'wwwroot\proxy.conf.json',
    'wwwroot\proxy.conf.js',
    'Properties\launchSettings.json',
    # Angular env files con backend URL hardcoded (api_url, meta_url,
    # global_root_url, upload_handler, upload_path, file_path).
    # In dev viene caricato `environment.ts`, in test `environment.test.ts`,
    # in prod `environment.prod.ts` (relative URLs, ma la skill template
    # ne ha alcuni assoluti — patch one-shot 5000->BackendPort).
    'wwwroot\src\app\environments\environment.ts',
    'wwwroot\src\app\environments\environment.test.ts',
    'wwwroot\src\app\environments\environment.prod.ts'
)
foreach ($pf in $portFiles) {
    $abs = Join-Path $projectRoot $pf
    if (Test-Path $abs) {
        $content = Get-Content -Path $abs -Raw -Encoding UTF8
        $newContent = $content -replace 'localhost:5000', "localhost:$BackendPort"
        if ($newContent -ne $content) {
            Set-Content -Path $abs -Value $newContent -Encoding UTF8 -NoNewline
            $stats.filesModified++
            Write-Host "  [port] $pf : :5000 -> :$BackendPort" -ForegroundColor DarkGray
        }
    }
}

# Angular
Process-File "wwwroot\angular.json"
Process-File "wwwroot\package.json"
Process-File "wwwroot\src\index.html"
Process-File "wwwroot\src\app\app.component.ts"
Process-File "wwwroot\src\app\app.component.spec.ts"

# VS Code
Process-File ".vscode\launch.json"
Process-File ".vscode\tasks.json"

# Genera .vscode/launch.json + tasks.json se mancanti (WuicTest template
# non li include). Senza launcher, il dev deve avviare backend e frontend
# manualmente in 2 terminali distinti. Verificato 2026-05-05 su FE.
$vscodeDir = Join-Path $projectRoot '.vscode'
if (-not (Test-Path $vscodeDir)) {
    New-Item -Path $vscodeDir -ItemType Directory -Force | Out-Null
}

$launchJsonPath = Join-Path $vscodeDir 'launch.json'
if (-not (Test-Path $launchJsonPath)) {
    # Frontend port = $BackendPort + 101 (es. 5100 -> 4201, 5150 -> 4251)
    # cosi' su istanze multiple non ci sono collisioni con :4200 di WuicTest.
    $frontendPort = 4201
    if ($BackendPort -ne 5100) {
        # tentativo coerente: 5150 -> 4251, 5200 -> 4301, ecc.
        $frontendPort = 4200 + ($BackendPort - 5000)
        if ($frontendPort -lt 4201) { $frontendPort = 4201 }
    }
    $launchJson = @"
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend: $pascal (Debug Breakpoints)",
      "type": "coreclr",
      "request": "launch",
      "preLaunchTask": "backend: launch prep",
      "program": "`${workspaceFolder}/bin/Debug/net10.0/$pascal.dll",
      "args": ["--urls=http://localhost:$BackendPort"],
      "cwd": "`${workspaceFolder}",
      "stopAtEntry": false,
      "console": "integratedTerminal",
      "justMyCode": true,
      "serverReadyAction": {
        "action": "openExternally",
        "pattern": "\\\\bNow listening on:\\\\s+(https?://\\\\S+)"
      },
      "env": { "ASPNETCORE_ENVIRONMENT": "Development" }
    },
    {
      "name": "Backend: $pascal (Hot Reload Watch)",
      "type": "coreclr",
      "request": "launch",
      "preLaunchTask": "backend: free port $BackendPort",
      "program": "dotnet",
      "args": [
        "watch",
        "--project",
        "`${workspaceFolder}/$pascal.csproj",
        "run",
        "--no-launch-profile",
        "--urls=http://localhost:$BackendPort"
      ],
      "cwd": "`${workspaceFolder}",
      "stopAtEntry": false,
      "console": "integratedTerminal",
      "justMyCode": true,
      "env": {
        "ASPNETCORE_ENVIRONMENT": "Development",
        "DOTNET_WATCH_SUPPRESS_LAUNCH_BROWSER": "1"
      }
    },
    {
      "name": "Frontend: Chrome (Start Frontend Tasks)",
      "type": "pwa-chrome",
      "request": "launch",
      "url": "http://localhost:$frontendPort",
      "runtimeArgs": ["--remote-debugging-port=9222"],
      "webRoot": "`${workspaceFolder}/wwwroot",
      "sourceMaps": true,
      "smartStep": false,
      "resolveSourceMapLocations": [
        "http://localhost:$frontendPort/**",
        "`${workspaceFolder}/wwwroot/**",
        "`${workspaceFolder}/../KonvergenceCore/wwwroot/my-workspace/projects/wuic-framework-lib/**",
        "!**/node_modules/**"
      ],
      "outFiles": [
        "`${workspaceFolder}/wwwroot/.angular/**/*.js",
        "`${workspaceFolder}/wwwroot/dist/**/*.js"
      ],
      "sourceMapPathOverrides": { "/@fs/*": "*" },
      "preLaunchTask": "frontend: run",
      "enableContentValidation": false
    }
  ],
  "compounds": [
    {
      "name": "Fullstack: Backend + Frontend + Chrome",
      "configurations": [
        "Backend: $pascal (Debug Breakpoints)",
        "Frontend: Chrome (Start Frontend Tasks)"
      ],
      "stopAll": true
    },
    {
      "name": "Fullstack: Backend Hot Reload + Frontend + Chrome",
      "configurations": [
        "Backend: $pascal (Hot Reload Watch)",
        "Frontend: Chrome (Start Frontend Tasks)"
      ],
      "stopAll": true
    }
  ]
}
"@
    Set-Content -Path $launchJsonPath -Value $launchJson -Encoding UTF8 -NoNewline
    Write-Host "  Generato: .vscode/launch.json (BE:$BackendPort, FE:$frontendPort)" -ForegroundColor DarkGray
}

$tasksJsonPath = Join-Path $vscodeDir 'tasks.json'
if (-not (Test-Path $tasksJsonPath)) {
    $frontendPortTasks = 4201
    if ($BackendPort -ne 5100) {
        $frontendPortTasks = 4200 + ($BackendPort - 5000)
        if ($frontendPortTasks -lt 4201) { $frontendPortTasks = 4201 }
    }
    $tasksJson = @"
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "backend: free port $BackendPort",
      "type": "shell",
      "command": "`$ErrorActionPreference='SilentlyContinue'; `$pids=@(); try { `$pids = Get-NetTCPConnection -State Listen -LocalPort $BackendPort | Select-Object -ExpandProperty OwningProcess -Unique } catch {}; if (-not `$pids) { `$pids = netstat -ano -p tcp | Select-String ':$BackendPort\\\\s+LISTENING\\\\s+(\\\\d+)`$' | ForEach-Object { `$_.Matches[0].Groups[1].Value } | Select-Object -Unique }; if (`$pids) { `$pids | ForEach-Object { Stop-Process -Id `$_ -Force -ErrorAction SilentlyContinue } }; exit 0",
      "options": { "shell": { "executable": "pwsh", "args": ["-NoProfile", "-Command"] } },
      "presentation": { "reveal": "never", "panel": "dedicated", "close": true },
      "problemMatcher": []
    },
    {
      "label": "backend: build",
      "type": "process",
      "command": "dotnet",
      "args": [
        "build",
        "`${workspaceFolder}/$pascal.csproj",
        "/property:GenerateFullPaths=true",
        "/consoleloggerparameters:NoSummary;ForceNoAlign"
      ],
      "problemMatcher": "`$msCompile"
    },
    {
      "label": "backend: launch prep",
      "dependsOrder": "sequence",
      "dependsOn": ["backend: free port $BackendPort", "backend: build"],
      "problemMatcher": []
    },
    {
      "label": "frontend: stop serving",
      "type": "shell",
      "command": "`$ErrorActionPreference='SilentlyContinue'; `$pids=@(); try { `$pids = Get-NetTCPConnection -State Listen -LocalPort $frontendPortTasks | Select-Object -ExpandProperty OwningProcess -Unique } catch {}; if (-not `$pids) { `$pids = netstat -ano -p tcp | Select-String ':$frontendPortTasks\\\\s+LISTENING\\\\s+(\\\\d+)`$' | ForEach-Object { `$_.Matches[0].Groups[1].Value } | Select-Object -Unique }; if (`$pids) { `$pids | ForEach-Object { Stop-Process -Id `$_ -Force -ErrorAction SilentlyContinue } }; exit 0",
      "options": { "shell": { "executable": "pwsh", "args": ["-NoProfile", "-Command"] } },
      "presentation": { "reveal": "never", "panel": "dedicated", "close": true },
      "problemMatcher": []
    },
    {
      "label": "frontend: serve",
      "type": "shell",
      "command": "npx ng serve $kebab --configuration=development --prebundle=true --host localhost --port $frontendPortTasks",
      "options": { "cwd": "`${workspaceFolder}/wwwroot" },
      "isBackground": true,
      "presentation": { "reveal": "always", "panel": "dedicated", "group": "frontend" },
      "problemMatcher": {
        "owner": "ng-serve",
        "pattern": { "regexp": "^`$" },
        "background": {
          "activeOnStart": true,
          "beginsPattern": "(Building|Watch mode enabled)",
          "endsPattern": "Application bundle generation complete"
        }
      }
    },
    {
      "label": "frontend: run",
      "dependsOrder": "sequence",
      "dependsOn": ["frontend: stop serving", "frontend: serve"],
      "problemMatcher": []
    }
  ]
}
"@
    Set-Content -Path $tasksJsonPath -Value $tasksJson -Encoding UTF8 -NoNewline
    Write-Host "  Generato: .vscode/tasks.json (FE:$frontendPortTasks, BE:$BackendPort)" -ForegroundColor DarkGray
}

# Solution / project files (.csproj, .sln, .nuspec)
$slnProjFiles = Get-ChildItem -Path $projectRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
        ($_.Extension -in @('.csproj', '.sln', '.nuspec', '.props', '.targets')) -and
        ($_.FullName -notmatch '\\(bin|obj|node_modules)\\')
    }
foreach ($f in $slnProjFiles) {
    $rel = $f.FullName.Substring($projectRoot.Length).TrimStart('\','/')
    Process-File $rel
}

# ── step 4: fix package.json name ───────────────────────────────────

Write-Host "--- 4/5 Verifica package.json name" -ForegroundColor Cyan
$pkgPath = Join-Path $projectRoot "wwwroot\package.json"
if (Test-Path $pkgPath) {
    $pkgContent = Get-Content -Path $pkgPath -Raw -Encoding UTF8
    if ($pkgContent -match '"name"\s*:\s*"[^"]*-standalone"') {
        $pkgContent = $pkgContent -replace '"name"\s*:\s*"[^"]*"', "`"name`": `"$kebab`""
        Set-Content -Path $pkgPath -Value $pkgContent -Encoding UTF8 -NoNewline
        Write-Host "  [ok] package.json name -> $kebab" -ForegroundColor Green
    } else {
        Write-Host "  [ok] package.json name gia' corretto" -ForegroundColor Green
    }
}

# ── step 5: rename project folder (in-place only) ───────────────────

Write-Host "--- 5/5 Rinomina cartella progetto" -ForegroundColor Cyan
$currentLeaf = Split-Path $projectRoot -Leaf
if ($currentLeaf -eq $oldPascal -and $InPlace) {
    $parentDir = Split-Path $projectRoot -Parent
    $newDir = Join-Path $parentDir $pascal
    if (Test-Path $newDir) {
        Write-Host "  [skip] cartella $newDir esiste gia'" -ForegroundColor Yellow
    } else {
        Rename-Item -Path $projectRoot -NewName $pascal
        $projectRoot = $newDir
        $stats.filesRenamed++
        Write-Host "  [ok] $oldPascal/ -> $pascal/" -ForegroundColor Green
    }
} else {
    Write-Host "  [skip] cartella gia' con nome corretto o modalita' clone" -ForegroundColor DarkGray
}

# ── summary ──────────────────────────────────────────────────────────

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Progetto rinominato: $pascal" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  File rinominati:  $($stats.filesRenamed)" -ForegroundColor White
Write-Host "  File aggiornati:  $($stats.filesModified)" -ForegroundColor White
Write-Host "  Cartella:         $projectRoot" -ForegroundColor White
Write-Host ""
Write-Host "Prossimi passi:" -ForegroundColor Cyan
Write-Host "  cd `"$projectRoot`"" -ForegroundColor White
Write-Host "  dotnet restore" -ForegroundColor White
Write-Host "  dotnet build $pascal.csproj" -ForegroundColor White
Write-Host "  cd wwwroot && npm install && npm run serve:npm" -ForegroundColor White
Write-Host ""
