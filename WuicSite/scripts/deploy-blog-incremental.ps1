<#
.SYNOPSIS
  Deploy INCREMENTALE per modifiche solo-contenuto del blog (titolo, testo, .md).
  Evita il full `/MIR` di deploy-site.ps1: builda e carica via SCP SOLO i file
  che cambiano per un edit di contenuto blog — le prerender HTML del blog (tutte
  le lingue), il manifest, la sitemap e gli asset .md. I bundle JS/CSS NON
  cambiano per un edit di contenuto (il testo è dato, non codice), quindi non
  vanno ricaricati; idem i GB di asset RAG/screenshot già sul server.

.NOTES
  - Usalo SOLO per edit di contenuto blog. Per cambi di codice/route/nuovi asset
    usa deploy-site.ps1 (full).
  - Nessuna maintenance page: i file blog sono statici, l'update è atomico per-file.
  - Richiede OpenSSH client (scp) e accesso SSH a $RemoteUserHost.
#>
param(
  [string]$Server = 'wuic-framework.com',
  [string]$RemoteUser = 'Administrator',
  [string]$SitePath = 'C:/inetpub/wwwroot/WuicSite',   # forward slash per scp Windows→Windows
  [switch]$SkipBuild                                    # riusa dist/ esistente
)
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $PSScriptRoot          # .../WuicSite
$distBrowser = Join-Path $scriptDir 'dist\WuicSite\browser'
$remote = "${RemoteUser}@${Server}"

if (-not $SkipBuild) {
  Push-Location $scriptDir
  Write-Host '==> generate manifest + sitemap' -ForegroundColor Cyan
  & node 'scripts/generate-blog-manifest.mjs'; if ($LASTEXITCODE) { throw 'manifest failed' }
  & node 'scripts/generate-sitemap.mjs';       if ($LASTEXITCODE) { throw 'sitemap failed' }
  Write-Host '==> ng build (prerender)' -ForegroundColor Cyan
  & npx ng build --configuration=production;   if ($LASTEXITCODE) { throw 'ng build failed' }
  Pop-Location
}
if (-not (Test-Path $distBrowser)) { throw "dist non trovata: $distBrowser (build prima, o togli -SkipBuild)" }

# Set MINIMO di path che cambiano per un edit di contenuto blog.
# blog/ (root EN) + <locale>/blog/ per ogni prefisso + manifest + sitemap + assets/blog.
$localePrefixes = @('', 'it', 'fr', 'es', 'de')
$ok = $true
foreach ($p in $localePrefixes) {
  $localBlog  = if ($p) { Join-Path $distBrowser "$p\blog" } else { Join-Path $distBrowser 'blog' }
  if (-not (Test-Path $localBlog)) { Write-Host "  [skip] $localBlog assente" -ForegroundColor DarkGray; continue }
  $remoteParent = if ($p) { "${SitePath}/$p" } else { $SitePath }
  Write-Host "==> scp blog ($([string]::IsNullOrEmpty($p) ? 'root' : $p))" -ForegroundColor Cyan
  & scp -r -q $localBlog "${remote}:${remoteParent}/"
  if ($LASTEXITCODE) { $ok = $false; Write-Host "  [err] scp blog $p exit $LASTEXITCODE" -ForegroundColor Red }
}
# File singoli
foreach ($f in @('blog-manifest.json', 'sitemap.xml')) {
  $lf = Join-Path $distBrowser $f
  if (Test-Path $lf) {
    Write-Host "==> scp $f" -ForegroundColor Cyan
    & scp -q $lf "${remote}:${SitePath}/$f"
    if ($LASTEXITCODE) { $ok = $false; Write-Host "  [err] scp $f exit $LASTEXITCODE" -ForegroundColor Red }
  }
}
# Asset .md del blog (il blog-post component li fetcha a runtime)
$localMd = Join-Path $distBrowser 'assets\blog'
if (Test-Path $localMd) {
  Write-Host '==> scp assets/blog (.md)' -ForegroundColor Cyan
  & scp -r -q $localMd "${remote}:${SitePath}/assets/"
  if ($LASTEXITCODE) { $ok = $false; Write-Host "  [err] scp assets/blog exit $LASTEXITCODE" -ForegroundColor Red }
}

if ($ok) { Write-Host "`nDeploy blog incrementale OK su $Server (solo blog/manifest/sitemap/assets)" -ForegroundColor Green }
else     { throw 'Deploy blog incrementale: uno o piu scp falliti (vedi sopra)' }
