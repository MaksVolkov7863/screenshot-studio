# Native messaging fallback if Python is not on PATH.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ocrScript = Join-Path $here "win-ocr.ps1"

$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()

function Read-NativeMessage {
    $lenBuf = New-Object byte[] 4
    $n = $stdin.Read($lenBuf, 0, 4)
    if ($n -lt 4) { return $null }
    $len = [BitConverter]::ToInt32($lenBuf, 0)
    if ($len -le 0 -or $len -gt 50000000) { throw "bad length $len" }
    $buf = New-Object byte[] $len
    $got = 0
    while ($got -lt $len) {
        $r = $stdin.Read($buf, $got, $len - $got)
        if ($r -le 0) { throw "stdin closed" }
        $got += $r
    }
    $json = [System.Text.Encoding]::UTF8.GetString($buf)
    return ConvertFrom-Json $json
}

function Write-NativeMessage($obj) {
    $json = $obj | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $len = [BitConverter]::GetBytes([int]$bytes.Length)
    $stdout.Write($len, 0, 4)
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
}

try {
    while ($true) {
        $msg = Read-NativeMessage
        if ($null -eq $msg) { break }
        if ($msg.ping) {
            Write-NativeMessage @{ ok = $true; engine = "windows"; capture = $true }
            continue
        }
        if ($msg.action -eq "capture" -or $msg.capture) {
            $tmp = [System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(), ".png")
            try {
                & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here "win-capture.ps1") -OutFile $tmp
                $bytes = [System.IO.File]::ReadAllBytes($tmp)
                $b64 = [Convert]::ToBase64String($bytes)
                Write-NativeMessage @{ ok = $true; dataUrl = ("data:image/png;base64," + $b64) }
            } catch {
                Write-NativeMessage @{ ok = $false; error = $_.Exception.Message }
            } finally {
                Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
            }
            continue
        }
        $dataUrl = [string]$msg.image
        if (-not $dataUrl) {
            Write-NativeMessage @{ ok = $false; error = "no image" }
            continue
        }
        if ($dataUrl.Contains(",")) { $dataUrl = $dataUrl.Split(",", 2)[1] }
        $bytes = [Convert]::FromBase64String($dataUrl)
        $tmp = [System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(), ".png")
        [System.IO.File]::WriteAllBytes($tmp, $bytes)
        try {
            $text = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ocrScript -Path $tmp
            Write-NativeMessage @{ ok = $true; text = [string]$text; engine = "windows" }
        } finally {
            Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
        }
    }
} catch {
    try { Write-NativeMessage @{ ok = $false; error = $_.Exception.Message } } catch { }
    exit 1
}
