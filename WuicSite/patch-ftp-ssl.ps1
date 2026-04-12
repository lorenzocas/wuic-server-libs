$ErrorActionPreference = 'Stop'

net stop ftpsvc 2>$null
net stop w3svc 2>$null
Start-Sleep -Seconds 2

$configPath = 'C:\Windows\System32\inetsrv\config\applicationHost.config'
$content = [System.IO.File]::ReadAllText($configPath, [System.Text.Encoding]::UTF8)
Write-Host "File length: $($content.Length)"

$marker = '</bindings>' + "`r`n" + '            </site>'
$markerAlt = '</bindings>' + "`n" + '            </site>'

$idx = $content.IndexOf($marker)
if ($idx -lt 0) { $idx = $content.IndexOf($markerAlt) }

# Only patch the LAST occurrence (WuicFTP is last site)
$lastIdx = $content.LastIndexOf($marker)
if ($lastIdx -lt 0) { $lastIdx = $content.LastIndexOf($markerAlt) }

Write-Host "Last marker at: $lastIdx"

if ($lastIdx -ge 0) {
    $ftpBlock = @'
</bindings>
                <ftpServer>
                    <security>
                        <ssl serverCertHash="FC029FF0E1D6E0AF53DFD6F9CD4C9D4333469004" serverCertStoreName="WebHosting" controlChannelPolicy="SslRequire" dataChannelPolicy="SslRequire" />
                        <authentication>
                            <basicAuthentication enabled="true" />
                        </authentication>
                    </security>
                </ftpServer>
            </site>
'@

    $markerLen = if ($content.IndexOf($marker) -ge 0) { $marker.Length } else { $markerAlt.Length }
    $content = $content.Remove($lastIdx, $markerLen).Insert($lastIdx, $ftpBlock)
    [System.IO.File]::WriteAllText($configPath, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Config patched successfully"
    Write-Host "Contains serverCertHash: $($content.Contains('serverCertHash'))"
} else {
    Write-Host "ERROR: marker not found in config"
}

net start w3svc
net start ftpsvc
