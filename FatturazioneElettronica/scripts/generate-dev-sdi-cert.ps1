#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Genera certificato self-signed PKCS#12 per testare la firma CADES-BES SDI.
.DESCRIPTION
  Output: secrets/sdi-dev-cert.p12 (RSA-2048, validity 10 anni). Password
  scelta dall'operatore (default: dev-only insecure password).

  PRODUZIONE: questo script NON va usato. Per emettere fatture reali serve
  un certificato qualificato di firma elettronica (CNS, FirmaSicura, ecc.)
  emesso da CA accreditata AgID. Usa solo dev/test.

.PARAMETER OutputPath
  Path file .p12 di output. Default: <ProjectRoot>/secrets/sdi-dev-cert.p12.

.PARAMETER Password
  Password PKCS#12. Default: 'wuic-dev-sdi-cert' (insicura — solo dev).

.PARAMETER SubjectCn
  Subject CN del certificato. Default: 'WUIC Dev SDI Signer'.
#>
[CmdletBinding()]
param(
    [string]$OutputPath = "$PSScriptRoot/../secrets/sdi-dev-cert.p12",
    [string]$Password = 'wuic-dev-sdi-cert',
    [string]$SubjectCn = 'WUIC Dev SDI Signer'
)

$ErrorActionPreference = 'Stop'

# Ensure output dir
$outDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

Write-Host "Generating self-signed cert for SDI dev signing..." -ForegroundColor Cyan
Write-Host "  Subject:  CN=$SubjectCn"
Write-Host "  Output:   $OutputPath"

# Use New-SelfSignedCertificate (Windows native).
$cert = New-SelfSignedCertificate `
    -Subject "CN=$SubjectCn" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -KeyExportPolicy Exportable `
    -KeyUsage DigitalSignature, NonRepudiation `
    -HashAlgorithm SHA256 `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -NotAfter (Get-Date).AddYears(10) `
    -Type DocumentEncryptionCert

$secPwd = ConvertTo-SecureString -String $Password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $OutputPath -Password $secPwd | Out-Null

# Cleanup: remove cert from cert store (we only want the .p12 on disk).
Get-ChildItem -Path "Cert:\CurrentUser\My\$($cert.Thumbprint)" | Remove-Item

$absolutePath = (Resolve-Path $OutputPath).Path
Write-Host ""
Write-Host "Done. Update appsettings.json:" -ForegroundColor Green
Write-Host '  "Sdi": {' -ForegroundColor Yellow
Write-Host '    "Signer": {' -ForegroundColor Yellow
Write-Host "      `"Pkcs12Path`": `"$($absolutePath -replace '\\','\\\\')`"," -ForegroundColor Yellow
Write-Host "      `"Pkcs12Password`": `"$Password`"" -ForegroundColor Yellow
Write-Host '    }' -ForegroundColor Yellow
Write-Host '  }' -ForegroundColor Yellow
Write-Host ""
Write-Host "Cert info:"
Write-Host "  Thumbprint: $($cert.Thumbprint)"
Write-Host "  NotBefore:  $($cert.NotBefore)"
Write-Host "  NotAfter:   $($cert.NotAfter)"
