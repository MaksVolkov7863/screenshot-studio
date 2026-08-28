# Registers Windows OCR native host for Firefox (Screenshot Studio).
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
  "description": "Windows OCR for Screenshot Studio",
  "path": "$cmdEsc",
  "type": "stdio",
  "allowed_extensions": ["screenshot-studio@nikita.dev"]
}
"@
$out = Join-Path $destDir "screenshot_studio_ocr.json"
[System.IO.File]::WriteAllText($out, $json)
Write-Host "OK: $out"
Write-Host "Host: $cmd"
Write-Host "Restart Firefox, then use Recognize text in the editor."
