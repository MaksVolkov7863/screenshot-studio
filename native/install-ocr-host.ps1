# Registers native host for Firefox (Screenshot Studio).
# Firefox on Windows finds hosts via the registry, not only the JSON file.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cmd = Join-Path $here "ocr-host.cmd"
if (-not (Test-Path $cmd)) { throw "ocr-host.cmd not found next to installer" }

$destDir = Join-Path $env:APPDATA "Mozilla\NativeMessagingHosts"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$cmdEsc = $cmd.Replace("\", "\\")
$json = @"
{
  "name": "screenshot_studio_ocr",
  "description": "Windows capture host for Screenshot Studio",
  "path": "$cmdEsc",
  "type": "stdio",
  "allowed_extensions": ["screenshot-studio@nikita.dev"]
}
"@
$out = Join-Path $destDir "screenshot_studio_ocr.json"
[System.IO.File]::WriteAllText($out, $json)

$regPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\screenshot_studio_ocr"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(default)" -Value $out

Write-Host "OK: $out"
Write-Host "Registry: $regPath -> $out"
Write-Host "Host: $cmd"
Write-Host "Fully quit Firefox (all windows) and open it again."
