$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $root "screenshot-studio.xpi"
$tmp = Join-Path $env:TEMP ("screenshot-studio-" + [guid]::NewGuid().ToString() + ".zip")
if (Test-Path $out) { Remove-Item $out }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($tmp, "Create")
Get-ChildItem -Path $root -Recurse -File | Where-Object {
  $_.FullName -notmatch "\\screenshot-studio\.(xpi|zip)$" -and
  $_.Name -ne "pack.ps1"
} | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length).TrimStart("\", "/")
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel.Replace("\", "/")) | Out-Null
}
$zip.Dispose()
Move-Item $tmp $out -Force
Write-Host "Packed $out"
